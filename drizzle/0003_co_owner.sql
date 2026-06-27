-- Co-owner: quản trị viên (tối đa 3), quyền gần bằng chủ chính
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'co_owner';
