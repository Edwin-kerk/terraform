import json

def extract_architecture(json_data):
    resources = json_data['values']['root_module']['resources']

    architecture = {
        "region": "unknown",
        "vpcs": {},
        "availability_zones": {}
    }

    # Temporary dictionaries to hold extracted resources
    vpcs = {}
    subnets = {}
    instances = {}

    # Extract Region, VPCs, Subnets, and Instances
    for resource in resources:
        if resource['type'] == 'aws_vpc':
            vpc_id = resource['values']['id']
            vpcs[vpc_id] = {
                "id": vpc_id,
                "cidr_block": resource['values']['cidr_block'],
                "subnets": []
            }
            architecture["region"] = resource['values'].get('region', 'unknown')

        elif resource['type'] == 'aws_subnet':
            subnet_name = resource['name']
            subnet_details = {
                "id": resource['values']['id'],
                "vpc_id": resource['values']['vpc_id'],
                "cidr_block": resource['values']['cidr_block'],
                "availability_zone": resource['values']['availability_zone']
            }
            subnets[subnet_name] = subnet_details

            # Add subnet to the correct availability zone
            az = subnet_details['availability_zone']
            if az not in architecture['availability_zones']:
                architecture['availability_zones'][az] = []
            architecture['availability_zones'][az].append({
                "name": subnet_name,
                "id": subnet_details['id'],
                "cidr_block": subnet_details['cidr_block']
            })

        elif resource['type'] == 'aws_instance':
            instance_details = {
                "name": resource['name'],
                "id": resource['values']['id'],
                "instance_type": resource['values']['instance_type'],
                "ami": resource['values']['ami'],
                "subnet_id": resource['values']['subnet_id']
            }
            instances[resource['name']] = instance_details

    # Map subnets to VPCs and instances to subnets
    for vpc_id, vpc_details in vpcs.items():
        vpc_details["subnets"] = [
            {
                "name": subnet_name,
                "id": subnet_details['id'],
                "cidr_block": subnet_details['cidr_block'],
                "availability_zone": subnet_details['availability_zone'],
                "instances": [
                    {
                        "name": instance_details['name'],
                        "id": instance_details['id'],
                        "instance_type": instance_details['instance_type'],
                        "ami": instance_details['ami']
                    }
                    for instance_name, instance_details in instances.items()
                    if instance_details['subnet_id'] == subnet_details['id']
                ]
            }
            for subnet_name, subnet_details in subnets.items()
            if subnet_details['vpc_id'] == vpc_id
        ]
        architecture['vpcs'][vpc_id] = vpc_details

    # Convert vpcs to list for final output
    architecture['vpcs'] = list(architecture['vpcs'].values())

    return architecture

def main():
    with open('terraform_state.json') as f:
        json_data = json.load(f)

    architecture = extract_architecture(json_data)

    with open('architecture.json', 'w') as f:
        json.dump(architecture, f, indent=4)

if __name__ == "__main__":
    main()
