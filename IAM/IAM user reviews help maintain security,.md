IAM user reviews help maintain security, compliance, and effective access control within an organization. If you have a specific IAM system or context in mind, such as AWS IAM, Azure AD, or another platform, please provide more details for more tailored guidance.


Storage Capacity: 

Estimate the storage required based on data volume. 

Plan for data retention policies (e.g., keeping data for 6 months). 

Example Calculation: 

If you collect 10MB of data per hour from each source, over a month (30 days), you’ll need: 10MB/hour∗24hours/day∗30days∗3sources=21,600MB=21.6GB10MB/hour * 24 hours/day * 30 days * 3 sources = 21,600 MB = 21.6 GB10MB/hour∗24hours/day∗30days∗3sources=21,600MB=21.6GB 

Evaluate the CPU and memory requirements for data transformation tasks. 

best practice to heap is code level

Code Level: Set heap memory configurations to define how much memory the application should use for its heap.
Pod Level: Set resource requests and limits to manage overall resource usage and ensure cluster stability.

Ca360$DOL

helm history grafana -n edi-demo
helm list 
