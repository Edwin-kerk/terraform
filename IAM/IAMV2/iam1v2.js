const {
    IAMClient,
    ListRolesCommand,
    ListUsersCommand,
    ListGroupsCommand
  } = require('@aws-sdk/client-iam');
  const { CloudTrailClient, LookupEventsCommand } = require('@aws-sdk/client-cloudtrail');
  const fs = require('fs');
  const process = require('process');
  
  // Configure AWS SDK v3 clients
  const iamClient = new IAMClient({
    region: process.env.AWS_REGION || 'us-east-1' // Set your region or use environment variable
  });
  
  const cloudTrailClient = new CloudTrailClient({
    region: process.env.AWS_REGION || 'us-east-1' // Set your region or use environment variable
  });
  
  // Helper function to handle pagination for AWS API calls
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
  
  // Helper function to get date ranges from months
  const getDateRanges = (months) => {
    const now = new Date();
    return months.map(month => {
      const startDate = new Date();
      startDate.setMonth(now.getMonth() - month);
      return { month, startDate, endDate: now };
    });
  };
  
  // Retrieve IAM roles, users, and groups with their creation dates
  const listAllRolesWithCreationDates = async () => {
    try {
      const command = new ListRolesCommand({});
      const roles = await paginate(iamClient, command, 'Roles');
      return roles.map(role => ({
        RoleName: role.RoleName,
        CreateDate: role.CreateDate
      }));
    } catch (err) {
      console.error('Error listing IAM roles:', err);
      throw err;
    }
  };
  
  const listAllUsersWithCreationDates = async () => {
    try {
      const command = new ListUsersCommand({});
      const users = await paginate(iamClient, command, 'Users');
      return users.map(user => ({
        UserName: user.UserName,
        CreateDate: user.CreateDate,
        PasswordLastUsed: user.PasswordLastUsed
      }));
    } catch (err) {
      console.error('Error listing IAM users:', err);
      throw err;
    }
  };
  
  const listAllGroupsWithCreationDates = async () => {
    try {
      const command = new ListGroupsCommand({});
      const groups = await paginate(iamClient, command, 'Groups');
      return groups.map(group => ({
        GroupName: group.GroupName,
        CreateDate: group.CreateDate
      }));
    } catch (err) {
      console.error('Error listing IAM groups:', err);
      throw err;
    }
  };
  
  // Analyze ID creation trends
  const analyzeIDCreation = (items, dateRanges) => {
    return dateRanges.map(({ month, startDate, endDate }) => {
      const filteredItems = items.filter(item => item.CreateDate >= startDate && item.CreateDate <= endDate);
      return {
        month,
        count: filteredItems.length,
        details: filteredItems.map(item => ({
          Name: item.RoleName || item.UserName || item.GroupName,
          CreateDate: item.CreateDate
        }))
      };
    });
  };
  
  // Track policy addition and deletion
  const trackPolicyChanges = async (startTime, endTime) => {
    try {
      const command = new LookupEventsCommand({
        StartTime: startTime,
        EndTime: endTime,
        LookupAttributes: [
          { AttributeKey: 'EventName', AttributeValue: 'CreatePolicy' },
          { AttributeKey: 'EventName', AttributeValue: 'DeletePolicy' },
          { AttributeKey: 'EventName', AttributeValue: 'AttachUserPolicy' },
          { AttributeKey: 'EventName', AttributeValue: 'DetachUserPolicy' },
          { AttributeKey: 'EventName', AttributeValue: 'AttachGroupPolicy' },
          { AttributeKey: 'EventName', AttributeValue: 'DetachGroupPolicy' }
        ],
        MaxResults: 50 // Adjust as needed
      });
  
      const events = await paginate(cloudTrailClient, command, 'Events');
      
      return {
        count: events.length,
        details: events.map(event => ({
          EventName: event.EventName,
          EventTime: event.EventTime,
          UserIdentity: event.UserIdentity ? event.UserIdentity.UserName : 'Unknown',
          Resources: event.Resources ? event.Resources.map(resource => resource.ResourceName) : []
        }))
      };
    } catch (err) {
      console.error('Error tracking policy changes:', err);
      throw err;
    }
  };
  
  // Analyze login trends
  const analyzeLoginTrends = (users, dateRanges) => {
    return dateRanges.map(({ month, startDate, endDate }) => {
      const filteredUsers = users.filter(user => user.PasswordLastUsed && user.PasswordLastUsed >= startDate && user.PasswordLastUsed <= endDate);
      return {
        month,
        count: filteredUsers.length,
        details: filteredUsers.map(user => ({
          UserName: user.UserName,
          PasswordLastUsed: user.PasswordLastUsed
        }))
      };
    });
  };
  
  // Analyze non-login trends
  const analyzeNonLoginTrends = (users, dateRanges) => {
    return dateRanges.map(({ month, startDate, endDate }) => {
      const filteredUsers = users.filter(user => !user.PasswordLastUsed || user.PasswordLastUsed < startDate);
      return {
        month,
        count: filteredUsers.length,
        details: filteredUsers.map(user => ({
          UserName: user.UserName,
          CreateDate: user.CreateDate
        }))
      };
    });
  };
  
  // Parse command-line arguments
  const parseArguments = () => {
    const args = process.argv.slice(2);
    const roleCreationMonths = args.find(arg => arg.startsWith('--role-months='))?.split('=')[1]?.split(',').map(Number) || [3, 6, 9];
    const userCreationMonths = args.find(arg => arg.startsWith('--user-months='))?.split('=')[1]?.split(',').map(Number) || [3, 6, 9];
    const groupCreationMonths = args.find(arg => arg.startsWith('--group-months='))?.split('=')[1]?.split(',').map(Number) || [3, 6, 9];
    const loginMonths = args.find(arg => arg.startsWith('--login-months='))?.split('=')[1]?.split(',').map(Number) || [1, 2, 3];
    const nonLoginMonths = args.find(arg => arg.startsWith('--nonlogin-months='))?.split('=')[1]?.split(',').map(Number) || [3, 6, 9];
    const customStartDate = args.find(arg => arg.startsWith('--start-date='))?.split('=')[1];
    const customEndDate = args.find(arg => arg.startsWith('--end-date='))?.split('=')[1];
    return { roleCreationMonths, userCreationMonths, groupCreationMonths, loginMonths, nonLoginMonths, customStartDate, customEndDate };
  };
  
  // Main function to execute all actions and save results to JSON files
  const main = async () => {
    try {
      const { roleCreationMonths, userCreationMonths, groupCreationMonths, loginMonths, nonLoginMonths, customStartDate, customEndDate } = parseArguments();
  
      const roles = await listAllRolesWithCreationDates();
      const users = await listAllUsersWithCreationDates();
      const groups = await listAllGroupsWithCreationDates();
  
      const roleDateRanges = getDateRanges(roleCreationMonths);
      const userDateRanges = getDateRanges(userCreationMonths);
      const groupDateRanges = getDateRanges(groupCreationMonths);
      const loginDateRanges = getDateRanges(loginMonths);
      const nonLoginDateRanges = getDateRanges(nonLoginMonths);
  
      const roleCreationCounts = analyzeIDCreation(roles, roleDateRanges);
      const userCreationCounts = analyzeIDCreation(users, userDateRanges);
      const groupCreationCounts = analyzeIDCreation(groups, groupDateRanges);
  
      const loginTrends = analyzeLoginTrends(users, loginDateRanges);
      const nonLoginTrends = analyzeNonLoginTrends(users, nonLoginDateRanges);
  
      const startTime = customStartDate ? new Date(customStartDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const endTime = customEndDate ? new Date(customEndDate) : new Date();
  
      const policyChanges = await trackPolicyChanges(startTime, endTime);
  
      // Combine and save results
      const results = {
        RoleCreationCounts: roleCreationCounts,
        UserCreationCounts: userCreationCounts,
        GroupCreationCounts: groupCreationCounts,
        LoginTrends: loginTrends,
        NonLoginTrends: nonLoginTrends,
        PolicyChanges: policyChanges
      };
  
      fs.writeFileSync('IAM_EC2_Details_Extended.json', JSON.stringify(results, null, 2));
      console.log('Extended details saved to IAM_EC2_Details_Extended.json');
    } catch (err) {
      console.error('Error in main function:', err);
    }
  };
  
  main();
  