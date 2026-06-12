# Security Specification

## Data Invariants
- Reports are created by anyone. Updates to votes or status require specific conditions. Modifying statuses to "fixed" or "archived" is restricted to Admins.
- Users can upvote a report only once by creating a confirmation document. We will not use relational upvote restrictions due to UI design.
- Admin creation: Admins cannot be created via the client SDK. Only the owner/admins can add to `allowed_emails`. 

## Phase 0: Dirty Dozen Payloads
1. Attempt to create report missing `category`
2. Attempt to create report with huge string
3. Attempt to set `status` directly to 'archived' on create without admin
4. Attempt to update another user's `report` status as a non-admin
5. Spoofing `admin` document creation
6. Modifying another `admin` document
7. Add email to `allowed_emails` as non-admin
8. Non-admin deleting a report
9. Add multiple `confirmations` with the same email 
10. Update `reports` without validating the data shape
11. PII exposure test: non-admins reading `admin` list

## Test Runner
The test runner will verify all operations.
