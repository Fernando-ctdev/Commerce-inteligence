-- Identity profile: nullable for existing accounts created before name was required.
ALTER TABLE "users" ADD COLUMN "name" TEXT;
