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

def extract_db_architecture(json_data):
    resources = json_data['values']['root_module']['resources']

    architecture = {
        "region": "unknown",
        "databases": [],
        "subnet_groups": []
    }

    # Temporary lists to hold extracted database resources and subnet groups
    databases = []
    subnet_groups = []

    # Extract Region, Databases, and RDS Subnet Groups
    for resource in resources:
        if resource['type'] in ['aws_db_instance', 'aws_rds_cluster', 'aws_dynamodb_table']:
            db_details = {
                "type": resource['type'],
                "name": resource['name'],
                "id": resource['values']['id'],
                "engine": resource['values'].get('engine', 'unknown'),
                "instance_class": resource['values'].get('instance_class', 'unknown'),
                "db_name": resource['values'].get('db_name', 'unknown'),
                "arn": resource['values'].get('arn', 'unknown')
            }
            databases.append(db_details)
            # Update region if found
            architecture["region"] = resource['values'].get('region', 'unknown')

        elif resource['type'] == 'aws_db_subnet_group':
            subnet_group_details = {
                "name": resource['name'],
                "id": resource['values']['id'],
                "description": resource['values'].get('description', 'unknown'),
                "subnets": resource['values'].get('subnet_ids', [])
            }
            subnet_groups.append(subnet_group_details)

    # Add extracted databases and subnet groups to the architecture
    architecture['databases'] = databases
    architecture['subnet_groups'] = subnet_groups

    return architecture

def main():
    tf_file_path = 'main.tf'
    json_file_path = 'terraform_state.json'

    # Extract region from main.tf
    region = extract_region_from_tf(tf_file_path)

    # Load Terraform state
    with open(json_file_path) as f:
        json_data = json.load(f)

    # Extract DB architecture
    architecture = extract_db_architecture(json_data)

    # Set the region in the architecture output
    architecture['region'] = region

    # Save the architecture to a file
    with open('db_architecture.json', 'w') as f:
        json.dump(architecture, f, indent=4)

if __name__ == "__main__":
    main()
