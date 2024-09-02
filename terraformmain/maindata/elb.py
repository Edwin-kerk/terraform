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

def extract_elbs_and_instances(json_data):
    resources = json_data['values']['root_module']['resources']

    elbs = {}
    instances = {}
    subnets_to_instances = {}

    # Extract ELBs and Instances
    for resource in resources:
        if resource['type'] == 'aws_elb':
            elb_id = resource['values']['id']
            elbs[elb_id] = {
                "name": resource['name'],
                "id": elb_id,
                "dns_name": resource['values'].get('dns_name', ''),
                "subnet_ids": resource['values'].get('subnets', []),  # Extract subnet IDs
                "instances": []  # Will be filled later
            }

        elif resource['type'] == 'aws_instance':
            instance_id = resource['values']['id']
            instance_subnet_id = resource['values'].get('subnet_id', '')
            instance_details = {
                "name": resource['name'],
                "id": instance_id,
                "instance_type": resource['values']['instance_type'],
                "ami": resource['values']['ami']
            }
            instances[instance_id] = instance_details

            # Map subnet IDs to instances
            if instance_subnet_id not in subnets_to_instances:
                subnets_to_instances[instance_subnet_id] = []
            subnets_to_instances[instance_subnet_id].append(instance_id)

    # Map instances to ELBs based on subnet IDs
    for elb_id, elb_details in elbs.items():
        elb_subnet_ids = elb_details.get('subnet_ids', [])
        for subnet_id in elb_subnet_ids:
            instance_ids = subnets_to_instances.get(subnet_id, [])
            for instance_id in instance_ids:
                if instance_id in instances:
                    elb_details['instances'].append({
                        "name": instances[instance_id]['name'],
                        "id": instance_id
                    })
        # Remove subnet_ids from ELB details
        elb_details.pop('subnet_ids', None)

    return {
        "region": "unknown",
        "elbs": list(elbs.values())
    }

def main():
    # Extract region from main.tf
    region = extract_region_from_main_tf('main.tf')

    # Load the Terraform state JSON
    with open('terraform_state.json') as f:
        json_data = json.load(f)

    # Extract ELBs and Instances, and link them
    elb_data = extract_elbs_and_instances(json_data)
    elb_data['region'] = region

    # Save the final ELB data JSON
    with open('elb_data.json', 'w') as f:
        json.dump(elb_data, f, indent=4)

if __name__ == "__main__":
    main()
