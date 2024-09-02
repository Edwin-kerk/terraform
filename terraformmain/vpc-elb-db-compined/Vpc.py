import json
import re

def extract_region_from_tf(tf_file_path):
    # Read the main.tf file
    with open(tf_file_path, 'r') as file:
        content = file.read()

    # Regular expression to find the region in the provider block
    match = re.search(r'region\s*=\s*"(\w+-\w+-\d+)"', content)
    if match:
        return match.group(1)
    else:
        return "unknown"

def extract_architecture(json_data):
    resources = json_data['values']['root_module']['resources']

    architecture = {
        "region": "unknown",
        "vpcs": []
    }

    # Temporary dictionaries to hold extracted resources
    vpcs = {}
    subnets = {}
    instances = {}

    # Extract Region, VPCs, Subnets, and Instances
    for resource in resources:
        if resource['type'] == 'aws_vpc':
            vpc_id = resource['values']['id']
            vpc_name = resource['name']  # Use VPC name
            vpc_details = {
                "name": vpc_name,
                "id": vpc_id,
                "cidr_block": resource['values']['cidr_block'],
                "subnets": []
            }
            vpcs[vpc_id] = vpc_details
            # Update region if found
            architecture["region"] = resource['values'].get('region', 'unknown')

        elif resource['type'] == 'aws_subnet':
            subnet_name = resource['name']
            subnet_details = {
                "id": resource['values']['id'],
                "vpc_id": resource['values']['vpc_id'],
                "cidr_block": resource['values']['cidr_block']
            }
            subnets[subnet_name] = subnet_details

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
        architecture['vpcs'].append(vpc_details)

    return architecture

def main():
    tf_file_path = 'main.tf'
    json_file_path = 'terraform_state.json'

    # Extract region from main.tf
    region = extract_region_from_tf(tf_file_path)

    # Load Terraform state
    with open(json_file_path) as f:
        json_data = json.load(f)

    # Extract architecture
    architecture = extract_architecture(json_data)

    # Set the region in the architecture output
    architecture['region'] = region

    # Save the architecture to a file
    with open('architecture.json', 'w') as f:
        json.dump(architecture, f, indent=4)

if __name__ == "__main__":
    main()
