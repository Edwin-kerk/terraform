const {
    IAMClient,
    ListRolesCommand,
    ListAttachedRolePoliciesCommand,
    ListRolePoliciesCommand,
    ListUsersCommand,
    ListAttachedUserPoliciesCommand,
    ListUserPoliciesCommand,
    ListGroupsCommand,
    ListAttachedGroupPoliciesCommand,
    GetGroupCommand,
    ListGroupPoliciesCommand,
    GetUserPolicyCommand,
    ListMFADevicesCommand,
    GetUserCommand,
    ListAccessKeysCommand,
    GetAccessKeyLastUsedCommand
  } = require('@aws-sdk/client-iam');
  
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
  
  // List all IAM roles and their attached/inline policies
  const listAllRolesWithPolicies = async () => {
    try {
      const command = new ListRolesCommand({});
      const roles = await paginate(iamClient, command, 'Roles');
  
      const promises = roles.map(async (role) => {
        try {
          const roleName = role.RoleName;
  
          // List attached role policies
          const attachedCommand = new ListAttachedRolePoliciesCommand({ RoleName: roleName });
          const attachedData = await iamClient.send(attachedCommand);
  
          // List inline role policies
          const inlineCommand = new ListRolePoliciesCommand({ RoleName: roleName });
          const inlineData = await iamClient.send(inlineCommand);
  
          return {
            RoleName: roleName,
            AttachedPolicies: attachedData.AttachedPolicies.map(policy => ({
              PolicyName: policy.PolicyName,
              PolicyArn: policy.PolicyArn
            })),
            InlinePolicies: inlineData.PolicyNames.map(policyName => ({
              PolicyName: policyName
            }))
          };
        } catch (err) {
          console.error(`Error listing policies for role ${role.RoleName}:`, err);
          return { RoleName: role.RoleName, AttachedPolicies: [], InlinePolicies: [] };
        }
      });
      return Promise.all(promises);
    } catch (err) {
      console.error('Error listing IAM roles:', err);
      throw err;
    }
  };
  
  // List IAM users and their attached/inline policies with additional details
  const listUsersWithDetails = async () => {
    try {
      const command = new ListUsersCommand({});
      const users = await paginate(iamClient, command, 'Users');
      const userDetailsPromises = users.map(async (user) => {
        try {
          const getUserCommand = new GetUserCommand({ UserName: user.UserName });
          const userData = await iamClient.send(getUserCommand);
  
          // Get MFA devices
          const mfaCommand = new ListMFADevicesCommand({ UserName: user.UserName });
          const mfaData = await iamClient.send(mfaCommand);
  
          // Get access keys
          const accessKeyCommand = new ListAccessKeysCommand({ UserName: user.UserName });
          const accessKeyData = await iamClient.send(accessKeyCommand);
  
          const accessKeyLastUsed = await Promise.all(
            accessKeyData.AccessKeyMetadata.map(async (key) => {
              const keyLastUsedCommand = new GetAccessKeyLastUsedCommand({ AccessKeyId: key.AccessKeyId });
              const keyLastUsedData = await iamClient.send(keyLastUsedCommand);
              return {
                AccessKeyId: key.AccessKeyId,
                LastUsedDate: keyLastUsedData.AccessKeyLastUsed.LastUsedDate,
                Region: keyLastUsedData.AccessKeyLastUsed.Region,
                ServiceName: keyLastUsedData.AccessKeyLastUsed.ServiceName
              };
            })
          );
  
          // Get attached policies
          const attachedPoliciesCommand = new ListAttachedUserPoliciesCommand({ UserName: user.UserName });
          const attachedPoliciesData = await iamClient.send(attachedPoliciesCommand);
  
          // Get inline policies
          const inlinePoliciesCommand = new ListUserPoliciesCommand({ UserName: user.UserName });
          const inlinePoliciesData = await iamClient.send(inlinePoliciesCommand);
  
          const inlinePolicies = await Promise.all(
            inlinePoliciesData.PolicyNames.map(async (policyName) => {
              const getUserPolicyCommand = new GetUserPolicyCommand({ UserName: user.UserName, PolicyName: policyName });
              const policyData = await iamClient.send(getUserPolicyCommand);
              return {
                PolicyName: policyName,
                PolicyDocument: policyData.PolicyDocument // Remove if policy document content is not required
              };
            })
          );
  
          // Determine if user has CLI access or Console access
          const hasAccessKeys = accessKeyData.AccessKeyMetadata.length > 0;
          const hasConsoleLogin = userData.User.PasswordLastUsed != null;
  
          // Calculate password age if available
          const passwordAge = userData.User.PasswordLastChanged
            ? Math.floor((new Date() - new Date(userData.User.PasswordLastChanged)) / (1000 * 60 * 60 * 24))
            : null;
  
          // Return user details with conditional console login info
          return {
            UserName: user.UserName,
            UserId: user.UserId,
            Arn: user.Arn,
            CreateDate: user.CreateDate,
            PasswordLastUsed: userData.User.PasswordLastUsed,
            PasswordAge: passwordAge,
            MFADevices: mfaData.MFADevices,
            AccessKeys: hasAccessKeys ? accessKeyLastUsed : null,
            ConsoleLogin: hasConsoleLogin ? userData.User.PasswordLastUsed : null,
            AttachedPolicies: attachedPoliciesData.AttachedPolicies.map(policy => ({
              PolicyName: policy.PolicyName,
              PolicyArn: policy.PolicyArn
            })),
            InlinePolicies: inlinePolicies.map(policy => ({
              PolicyName: policy.PolicyName
            })),
            PolicyType: {
              CLI: hasAccessKeys,
              Console: hasConsoleLogin
            }
          };
        } catch (err) {
          console.error(`Error retrieving details for user ${user.UserName}:`, err);
          return null;
        }
      });
  
      return Promise.all(userDetailsPromises);
    } catch (err) {
      console.error('Error listing IAM users:', err);
      throw err;
    }
  };
  
  // Classify users by policy type (CLI or Console)
  const classifyUsersByPolicyType = (userDetails) => {
    return userDetails.map((user) => {
      const isCLIUser = user.AccessKeys && user.AccessKeys.length > 0;
      const isConsoleUser = !!user.ConsoleLogin;
  
      return {
        UserName: user.UserName,
        UserId: user.UserId,
        Arn: user.Arn,
        MFADevices: user.MFADevices,
        PasswordAge: user.PasswordAge,
        ConsoleLogin: isConsoleUser ? user.ConsoleLogin : null, // Include console login only for console users
        AccessKeys: isCLIUser ? user.AccessKeys : null, // Include access keys only for CLI users
        AttachedPolicies: user.AttachedPolicies,
        InlinePolicies: user.InlinePolicies,
        PolicyType: {
          CLI: isCLIUser,
          Console: isConsoleUser
        }
      };
    });
  };
  
  // List IAM groups and their attached/inline policies and users
  const listGroupsUsersAndPolicies = async () => {
    try {
      const command = new ListGroupsCommand({});
      const groups = await paginate(iamClient, command, 'Groups');
  
      const promises = groups.map(async (group) => {
        // Get the group details (users in the group)
        const getGroupCommand = new GetGroupCommand({ GroupName: group.GroupName });
        const groupData = await iamClient.send(getGroupCommand);
  
        // Get the attached policies for the group
        const listAttachedGroupPoliciesCommand = new ListAttachedGroupPoliciesCommand({ GroupName: group.GroupName });
        const attachedGroupPoliciesData = await iamClient.send(listAttachedGroupPoliciesCommand);
  
        // Get the inline policies for the group
        const listGroupPoliciesCommand = new ListGroupPoliciesCommand({ GroupName: group.GroupName });
        const inlineGroupPoliciesData = await iamClient.send(listGroupPoliciesCommand);
  
        // Get policies attached to each user in the group
        const usersWithPolicies = await Promise.all(groupData.Users.map(async (user) => {
          const attachedPoliciesCommand = new ListAttachedUserPoliciesCommand({ UserName: user.UserName });
          const attachedUserPoliciesData = await iamClient.send(attachedPoliciesCommand);
  
          const inlinePoliciesCommand = new ListUserPoliciesCommand({ UserName: user.UserName });
          const inlineUserPoliciesData = await iamClient.send(inlinePoliciesCommand);
  
          return {
            UserName: user.UserName,
            AttachedPolicies: attachedUserPoliciesData.AttachedPolicies,
            InlinePolicies: inlineUserPoliciesData.PolicyNames
          };
        }));
  
        return {
          GroupName: group.GroupName,
          GroupId: group.GroupId,
          Users: groupData.Users,
          AttachedPolicies: attachedGroupPoliciesData.AttachedPolicies,
          InlinePolicies: inlineGroupPoliciesData.PolicyNames,
          UsersWithPolicies: usersWithPolicies
        };
      });
  
      return Promise.all(promises);
    } catch (err) {
      console.error('Error listing IAM groups:', err);
      throw err;
    }
  };
  
  // List EC2 instances with attached IAM roles
  const listEC2InstancesWithRoles = async () => {
    try {
      const command = new DescribeInstancesCommand({});
      const data = await paginate(ec2Client, command, 'Reservations');
      
      return data.flatMap(reservation => 
        reservation.Instances
          .filter(instance => instance.IamInstanceProfile) // Only include instances with attached roles
          .map(instance => ({
            InstanceId: instance.InstanceId,
            IamInstanceProfileArn: instance.IamInstanceProfile.Arn,
            RoleName: instance.IamInstanceProfile.Arn.split('/').pop() // Extract role name from ARN
          }))
      );
    } catch (err) {
      console.error('Error listing EC2 instances with roles:', err);
      throw err;
    }
  };
  
  // Main function to execute all actions and save results to JSON files
  const main = async () => {
    try {
      const allRolesWithPolicies = await listAllRolesWithPolicies();
      const userDetails = await listUsersWithDetails();
      const classifiedUsers = classifyUsersByPolicyType(userDetails.filter(user => user !== null));
      const groups = await listGroupsUsersAndPolicies();
      const ec2InstancesWithRoles = await listEC2InstancesWithRoles();
  
      const results = {
        IAMRoles: allRolesWithPolicies,
        IAMUsers: classifiedUsers,
        IAMGroups: groups,
        EC2InstancesWithRoles: ec2InstancesWithRoles
      };
  
      fs.writeFileSync('IAM_EC2_Details.json', JSON.stringify(results, null, 2));
      console.log('Details saved to IAM_EC2_Details.json');
    } catch (err) {
      console.error('Error in main function:', err);
    }
  };
  
  main();
  