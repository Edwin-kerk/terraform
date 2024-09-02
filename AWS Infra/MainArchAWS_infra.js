const AWS = require('aws-sdk');
const fs = require('fs');
const graphviz = require('graphviz');
const exec = require('child_process').exec;

// Configure AWS SDK
AWS.config.update({ region: 'us-east-1' });

// Initialize AWS services
const ec2 = new AWS.EC2();
const rds = new AWS.RDS();
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();

// List EC2 instances with details
const listEC2Instances = async () => {
  try {
    const data = await ec2.describeInstances().promise();
    const instances = data.Reservations.flatMap(reservation =>
      reservation.Instances.map(instance => ({
        InstanceId: instance.InstanceId,
        InstanceType: instance.InstanceType,
        Name: (instance.Tags.find(tag => tag.Key === 'Name') || {}).Value || 'N/A',
        VpcId: instance.VpcId,
        SubnetId: instance.SubnetId,
        PrivateIpAddress: instance.PrivateIpAddress,
        PublicIpAddress: instance.PublicIpAddress || 'N/A'
      }))
    );
    return instances;
  } catch (err) {
    console.error('Error listing EC2 instances:', err);
    return [];
  }
};

// List VPCs and their subnets
const listVPCs = async (instances) => {
  try {
    const vpcData = await ec2.describeVpcs().promise();
    const vpcIds = vpcData.Vpcs.map(vpc => vpc.VpcId);

    const subnetData = await ec2.describeSubnets().promise();
    const subnets = subnetData.Subnets.map(subnet => ({
      SubnetId: subnet.SubnetId,
      VpcId: subnet.VpcId,
      CidrBlock: subnet.CidrBlock,
      AvailabilityZone: subnet.AvailabilityZone,
      Public: false // Default to private
    }));

    // Retrieve route tables to determine public vs private subnets
    const routeTableData = await ec2.describeRouteTables().promise();
    routeTableData.RouteTables.forEach(routeTable => {
      const hasInternetGateway = routeTable.Routes.some(route => route.GatewayId && route.GatewayId.startsWith('igw-'));
      if (hasInternetGateway) {
        routeTable.Associations.forEach(association => {
          if (association.SubnetId) {
            const subnet = subnets.find(subnet => subnet.SubnetId === association.SubnetId);
            if (subnet) subnet.Public = true;
          }
        });
      }
    });

    // Filter out only those subnets that are used by at least one EC2 instance
    const usedSubnets = subnets.filter(subnet => {
      return instances.some(instance => instance.SubnetId === subnet.SubnetId);
    });

    // Map subnets to their VPCs
    const vpcs = vpcData.Vpcs.map(vpc => ({
      VpcId: vpc.VpcId,
      CidrBlock: vpc.CidrBlock,
      State: vpc.State,
      Subnets: usedSubnets.filter(subnet => subnet.VpcId === vpc.VpcId)
    }));

    return vpcs;
  } catch (err) {
    console.error('Error listing VPCs:', err);
    return [];
  }
};

// List RDS instances
const listRDSInstances = async () => {
  try {
    const data = await rds.describeDBInstances().promise();
    const instances = data.DBInstances.map(instance => ({
      DBInstanceIdentifier: instance.DBInstanceIdentifier,
      DBInstanceClass: instance.DBInstanceClass,
      Engine: instance.Engine,
      DBInstanceStatus: instance.DBInstanceStatus,
      VpcId: instance.DBSubnetGroup.VpcId,
      SubnetIds: instance.DBSubnetGroup.Subnets.map(subnet => subnet.SubnetIdentifier)
    }));
    return instances;
  } catch (err) {
    console.error('Error listing RDS instances:', err);
    return [];
  }
};

// List S3 buckets
const listS3Buckets = async () => {
  try {
    const data = await s3.listBuckets().promise();
    const buckets = data.Buckets.map(bucket => ({
      Name: bucket.Name
    }));
    return buckets;
  } catch (err) {
    console.error('Error listing S3 buckets:', err);
    return [];
  }
};

// List Lambda functions
const listLambdaFunctions = async () => {
  try {
    const data = await lambda.listFunctions().promise();
    const functions = data.Functions.map(func => ({
      FunctionName: func.FunctionName,
      Runtime: func.Runtime,
      VpcId: func.VpcConfig ? func.VpcConfig.VpcId : 'N/A',
      SubnetIds: func.VpcConfig ? func.VpcConfig.SubnetIds : []
    }));
    return functions;
  } catch (err) {
    console.error('Error listing Lambda functions:', err);
    return [];
  }
};

// Generate Graphviz DOT file
const generateGraph = (vpcs, ec2Instances, rdsInstances, s3Buckets, lambdaFunctions) => {
  const g = graphviz.digraph('G');

  // Set graph attributes
  g.set('rankdir', 'LR'); // Left-to-right layout for better alignment

  // Add VPC nodes
  vpcs.forEach(vpc => {
    g.addNode(vpc.VpcId, { shape: 'box', style: 'filled', fillcolor: 'lightblue' });
    vpc.Subnets.forEach(subnet => {
      g.addNode(subnet.SubnetId, { shape: 'ellipse', style: 'filled', fillcolor: subnet.Public ? 'yellow' : 'lightgreen' });
      g.addEdge(vpc.VpcId, subnet.SubnetId);
    });
  });

  // Add EC2 instance nodes and edges
  ec2Instances.forEach(instance => {
    const nodeId = `i-${instance.InstanceId}`;
    g.addNode(nodeId, { shape: 'rectangle', style: 'filled', fillcolor: 'lightcoral', label: `${instance.Name}\n${instance.InstanceType}\nPrivate IP: ${instance.PrivateIpAddress}\nPublic IP: ${instance.PublicIpAddress}` });
    g.addEdge(instance.SubnetId, nodeId); // EC2 instances connected to subnets
  });

  // Add RDS instance nodes and edges
  rdsInstances.forEach(instance => {
    const nodeId = `db-${instance.DBInstanceIdentifier}`;
    g.addNode(nodeId, { shape: 'rectangle', style: 'filled', fillcolor: 'lightcyan', label: `${instance.DBInstanceIdentifier}\n${instance.Engine}` });
    instance.SubnetIds.forEach(subnetId => {
      g.addEdge(subnetId, nodeId); // RDS instances connected to subnets
    });
  });

  // Create a virtual cluster for S3 buckets
  g.addNode('S3Cluster', { shape: 'rect', style: 'dashed', label: 'S3 Buckets', fillcolor: 'lightgreen' });

  // Add S3 buckets to the virtual cluster
  s3Buckets.forEach(bucket => {
    const bucketNodeId = `s3-${bucket.Name}`;
    g.addNode(bucketNodeId, { shape: 'cylinder', style: 'filled', fillcolor: 'lightgoldenrod', label: bucket.Name });
    g.addEdge('S3Cluster', bucketNodeId); // Connect S3 buckets to the virtual cluster
  });

  // Add Lambda function nodes and edges
  lambdaFunctions.forEach(func => {
    const nodeId = `lambda-${func.FunctionName}`;
    g.addNode(nodeId, { shape: 'rectangle', style: 'filled', fillcolor: 'lightpink', label: `${func.FunctionName}\n${func.Runtime}` });
    func.SubnetIds.forEach(subnetId => {
      g.addEdge(subnetId, nodeId); // Lambda functions connected to subnets
    });
  });

  return g.to_dot();
};

// Combine all resources and generate graph
const listResourcesAndGenerateGraph = async () => {
  try {
    const ec2Instances = await listEC2Instances();
    const vpcs = await listVPCs(ec2Instances);
    const rdsInstances = await listRDSInstances();
    const s3Buckets = await listS3Buckets();
    const lambdaFunctions = await listLambdaFunctions();

    // Structure resources for JSON output
    const resources = vpcs.map(vpc => ({
      VpcId: vpc.VpcId,
      CidrBlock: vpc.CidrBlock,
      State: vpc.State,
      Subnets: vpc.Subnets.map(subnet => ({
        SubnetId: subnet.SubnetId,
        CidrBlock: subnet.CidrBlock,
        AvailabilityZone: subnet.AvailabilityZone,
        Public: subnet.Public,
        EC2Instances: ec2Instances.filter(instance => instance.SubnetId === subnet.SubnetId),
        RDSInstances: rdsInstances.filter(instance => instance.SubnetIds.includes(subnet.SubnetId)),
        LambdaFunctions: lambdaFunctions.filter(func => func.SubnetIds.includes(subnet.SubnetId))
      }))
    }));

    const jsonOutput = {
      VPCs: resources,
      S3Buckets: s3Buckets
    };

    // Save resources to a JSON file
    fs.writeFileSync('aws_resources.json', JSON.stringify(jsonOutput, null, 2), 'utf8');
    console.log('Resources saved to aws_resources.json.');

    const dotContent = generateGraph(vpcs, ec2Instances, rdsInstances, s3Buckets, lambdaFunctions);

    // Save DOT file
    fs.writeFileSync('graph.dot', dotContent, 'utf8');
    console.log('DOT file generated.');

    // Convert DOT file to PNG
    exec('dot -Tpng graph.dot -o graph.png', (err, stdout, stderr) => {
      if (err) {
        console.error('Error generating PNG:', err);
      } else {
        console.log('Graph saved as graph.png');
      }
    });
  } catch (err) {
    console.error('Error generating graph:', err);
  }
};

listResourcesAndGenerateGraph();
