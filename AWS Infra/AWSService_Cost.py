import boto3
import json
from datetime import datetime, timedelta

# Function to calculate the first and last day of the previous month
def get_last_month():
    first_day_of_current_month = datetime.today().replace(day=1)
    last_day_of_previous_month = first_day_of_current_month - timedelta(days=1)
    first_day_of_previous_month = last_day_of_previous_month.replace(day=1)
    return first_day_of_previous_month.strftime('%Y-%m-%d'), last_day_of_previous_month.strftime('%Y-%m-%d')

# Get the start and end dates for the previous month
start_date, end_date = get_last_month()

# Initialize the Cost Explorer client
client = boto3.client('ce', region_name='us-east-1')

try:
    # Define the parameters for the API call
    response = client.get_cost_and_usage(
        TimePeriod={
            'Start': start_date,  # Dynamic start date
            'End': end_date       # Dynamic end date
        },
        Granularity='MONTHLY',  # or DAILY
        Metrics=['UnblendedCost'],
        GroupBy=[
            {
                'Type': 'DIMENSION',
                'Key': 'SERVICE'  # Group by AWS service
            }
        ]
    )

    # Extract and store the service names with non-zero costs
    services = set()

    for result in response.get('ResultsByTime', []):
        for group in result.get('Groups', []):
            if float(group['Metrics']['UnblendedCost']['Amount']) > 0:
                services.add(group['Keys'][0])

    # Save service names with non-zero costs to a file
    with open('aws_services_with_cost.txt', 'w') as file:
        for service in services:
            file.write(service + '\n')

    print('Service names with non-zero costs saved to aws_services_with_cost.txt')

except Exception as e:
    print(f"An error occurred: {e}")