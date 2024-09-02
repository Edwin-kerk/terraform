const { IAMClient, ListUsersCommand, ListRolesCommand, ListAttachedUserPoliciesCommand, ListAttachedRolePoliciesCommand, ListGroupsCommand, ListAttachedGroupPoliciesCommand, GetGroupCommand } = require('@aws-sdk/client-iam');
const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
const { fromEnv } = require('@aws-sdk/credential-providers');
const fs = require('fs');

// Configure AWS SDK v3
const iamClient = new IAMClient({
  region: process.env.AWS_REGION,
  credentials: fromEnv()
});

const ec2Client = new EC2Client({
  region: process.env.AWS_REGION,
  credentials: fromEnv()
});

// Helper function to handle pagination
const paginate = async (client, command, key) => {
  let results = [];
  let nextToken = null;
  do {
    const data = await client.send(command);
    results = results.concat(data[key]);
    nextToken = data.NextToken;
    command.input.NextToken = nextToken;
  } while (nextToken);
  return results;
};

// List IAM users
const listUsers = async () => {
  try {
    const command = new ListUsersCommand({});
    const users = await paginate(iamClient, command, 'Users');
    return users.map(user => ({
      UserName: user.UserName,
      UserId: user.UserId,
      Arn: user.Arn
    }));
  } catch (err) {
    console.error('Error listing IAM users:', err);
    throw err;
  }
};

// List IAM roles
const listRoles = async () => {
  try {
    const command = new ListRolesCommand({});
    const roles = await paginate(iamClient, command, 'Roles');
    return roles.map(role => ({
      RoleName: role.RoleName,
      RoleId: role.RoleId,
      Arn: role.Arn
    }));
  } catch (err) {
    console.error('Error listing IAM roles:', err);
    throw err;
  }
};

// List attached policies for users
const listUserPolicies = async (users) => {
  const promises = users.map(async (user) => {
    try {
      const command = new ListAttachedUserPoliciesCommand({ UserName: user.UserName });
      const data = await iamClient.send(command);
      return {
        UserName: user.UserName,
        Policies: data.AttachedPolicies.map(policy => ({
          PolicyName: policy.PolicyName,
          PolicyArn: policy.PolicyArn
        }))
      };
    } catch (err) {
      console.error(`Error listing policies for user ${user.UserName}:`, err);
      return { UserName: user.UserName, Policies: [] };
    }
  });
  return Promise.all(promises);
};

// List attached policies for roles
const listRolePolicies = async (roles) => {
  const promises = roles.map(async (role) => {
    try {
      const command = new ListAttachedRolePoliciesCommand({ RoleName: role.RoleName });
      const data = await iamClient.send(command);
      return {
        RoleName: role.RoleName,
        Policies: data.AttachedPolicies.map(policy => ({
          PolicyName: policy.PolicyName,
          PolicyArn: policy.PolicyArn
        }))
      };
    } catch (err) {
      console.error(`Error listing policies for role ${role.RoleName}:`, err);
      return { RoleName: role.RoleName, Policies: [] };
    }
  });
  return Promise.all(promises);
};

// List IAM groups
const listGroups = async () => {
  try {
    const command = new ListGroupsCommand({});
    const groups = await paginate(iamClient, command, 'Groups');
    return groups.map(group => ({
      GroupName: group.GroupName,
      GroupId: group.GroupId,
      Arn: group.Arn
    }));
  } catch (err) {
    console.error('Error listing IAM groups:', err);
    throw err;
  }
};

// List users attached to each group along with their attached group policies and user policies
const listGroupUsersAndPolicies = async (groups) => {
  const promises = groups.map(async (group) => {
    try {
      // Get the group details (users in the group)
      const getGroupCommand = new GetGroupCommand({ GroupName: group.GroupName });
      const groupData = await iamClient.send(getGroupCommand);

      // Get the attached policies for the group
      const listGroupPoliciesCommand = new ListAttachedGroupPoliciesCommand({ GroupName: group.GroupName });
      const groupPoliciesData = await iamClient.send(listGroupPoliciesCommand);

      // Get policies attached to each user in the group
      const usersWithPolicies = await Promise.all(groupData.Users.map(async (user) => {
        const userPoliciesCommand = new ListAttachedUserPoliciesCommand({ UserName: user.UserName });
        const userPoliciesData = await iamClient.send(userPoliciesCommand);

        return {
          UserName: user.UserName,
          Policies: userPoliciesData.AttachedPolicies.map(policy => ({
            PolicyName: policy.PolicyName,
            PolicyArn: policy.PolicyArn
          }))
        };
      }));

      return {
        GroupName: group.GroupName,
        GroupPolicies: groupPoliciesData.AttachedPolicies.map(policy => ({
          PolicyName: policy.PolicyName,
          PolicyArn: policy.PolicyArn
        })),
        Users: usersWithPolicies
      };
    } catch (err) {
      console.error(`Error processing group ${group.GroupName}:`, err);
      return {
        GroupName: group.GroupName,
        GroupPolicies: [],
        Users: []
      };
    }
  });

  return Promise.all(promises);
};

// List EC2 instances and their associated IAM roles
const listEC2InstancesWithRoles = async () => {
  try {
    const command = new DescribeInstancesCommand({});
    const data = await paginate(ec2Client, command, 'Reservations');
    return data.flatMap(reservation =>
      reservation.Instances.map(instance => ({
        InstanceId: instance.InstanceId,
        IamInstanceProfile: instance.IamInstanceProfile ? instance.IamInstanceProfile.Arn : null,
        RoleName: instance.IamInstanceProfile ? instance.IamInstanceProfile.Arn.split('/').pop() : null
      }))
    ).filter(instance => instance.IamInstanceProfile);
  } catch (err) {
    console.error('Error listing EC2 instances:', err);
    throw err;
  }
};

// Combine all IAM resources and save to JSON file
const listIAMResourcesAndSaveJSON = async () => {
  try {
    const users = await listUsers();
    const roles = await listRoles();
    const groups = await listGroups();
    const userPolicies = await listUserPolicies(users);
    const rolePolicies = await listRolePolicies(roles);
    const groupUsersAndPolicies = await listGroupUsersAndPolicies(groups);
    const ec2InstancesWithRoles = await listEC2InstancesWithRoles();

    const resources = {
      UserPolicies: userPolicies,
      RolePolicies: rolePolicies,
      GroupUsersAndPolicies: groupUsersAndPolicies,
      EC2InstancesWithRoles: ec2InstancesWithRoles
    };

    // Save resources to a JSON file
    fs.writeFileSync('iam_resources.json', JSON.stringify(resources, null, 2), 'utf8');
    console.log('IAM resources JSON file generated: iam_resources.json');
  } catch (err) {
    console.error('Error listing IAM resources and saving JSON:', err);
  }
};

// Run the script
listIAMResourcesAndSaveJSON();
