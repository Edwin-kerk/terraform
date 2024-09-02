import json

def load_json(file_path):
    with open(file_path, 'r') as file:
        return json.load(file)

def combine_architecture(vpc_file, elb_file, db_file, output_file):
    # Load JSON data from individual files
    vpc_data = load_json(vpc_file)
    elb_data = load_json(elb_file)
    db_data = load_json(db_file)

    # Combine data into a single architecture dictionary
    combined_data = {
        "region": vpc_data.get("region", "unknown"),
        "vpcs": vpc_data.get("vpcs", []),
        "elbs": elb_data.get("elbs", []),
        "databases": db_data.get("databases", []),
        "subnet_groups": db_data.get("subnet_groups", [])
    }

    # Save the combined architecture to a new file
    with open(output_file, 'w') as file:
        json.dump(combined_data, file, indent=4)

if __name__ == "__main__":
    combine_architecture('architecture.json', 'elb_data.json', 'db_architecture.json', 'combined_architecture.json')
