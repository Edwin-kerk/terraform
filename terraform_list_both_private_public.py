import json
import re

def extract_region_from_main_tf(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    region_match = re.search(r'region\s*=\s*"([^"]+)"', content)
    if region_match:
        return region_match.group(1)
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

    # Extract VPCs, Subnets, and Instances
    for resource in resources:
        if resource['type'] == 'aws_vpc':
            vpc_id = resource['values']['id']
            vpcs[vpc_id] = {
                "name": resource['name'],
                "id": vpc_id,
                "cidr_block": resource['values']['cidr_block'],
                "subnets": []
            }

        elif resource['type'] == 'aws_subnet':
            subnet_id = resource['values']['id']
            subnet_details = {
                "id": subnet_id,
                "vpc_id": resource['values']['vpc_id'],
                "cidr_block": resource['values']['cidr_block'],
                "availability_zone": resource['values']['availability_zone'],
                "type": "public" if 'public' in resource['name'].lower() else "private",
                "instances": []
            }
            subnets[subnet_id] = subnet_details

        elif resource['type'] == 'aws_instance':
            instance_id = resource['values']['id']
            instance_details = {
                "name": resource['name'],
                "id": instance_id,
                "instance_type": resource['values']['instance_type'],
                "ami": resource['values']['ami'],
                "subnet_id": resource['values']['subnet_id']
            }
            instances[instance_id] = instance_details

    # Map instances to subnets
    for instance_id, instance_details in instances.items():
        subnet_id = instance_details['subnet_id']
        if subnet_id in subnets:
            subnets[subnet_id]["instances"].append(instance_details)

    # Map subnets to VPCs
    for vpc_id, vpc_details in vpcs.items():
        vpc_details["subnets"] = [
            subnet_details
            for subnet_id, subnet_details in subnets.items()
            if subnet_details['vpc_id'] == vpc_id
        ]
        architecture['vpcs'].append(vpc_details)

    return architecture

def main():
    # Extract region from main.tf
    region = extract_region_from_main_tf('main.tf')

    # Load the Terraform state JSON
    with open('terraform_state.json') as f:
        json_data = json.load(f)

    # Extract architecture and include the region
    architecture = extract_architecture(json_data)
    architecture['region'] = region

    # Save the final architecture JSON
    with open('architecture.json', 'w') as f:
        json.dump(architecture, f, indent=4)

if __name__ == "__main__":
    main()
