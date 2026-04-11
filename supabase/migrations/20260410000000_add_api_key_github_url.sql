-- Add api_key and github_repo_url columns to apis table
alter table apis add column if not exists api_key         text;
alter table apis add column if not exists github_repo_url text;
