#!/usr/bin/env python3
"""DailyPlan 邀请码生成工具

用法：
  # 生成 5 个邀请码（需要已知管理员 user_id）
  python generate_codes.py --user-id 1 --count 5

  # 直接操作 MySQL 生成邀请码
  python generate_codes.py --db-type mysql --count 5

环境变量（MySQL 模式）：
  DP_MYSQL_HOST / DP_MYSQL_PORT / DP_MYSQL_USER / DP_MYSQL_PASSWORD / DP_MYSQL_DB
"""

import os, sys, argparse

# Add parent dir to path so we can import server modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from server.db import get_db, create_invite_code


def main():
    parser = argparse.ArgumentParser(description='DailyPlan 邀请码生成工具')
    parser.add_argument('--user-id', type=int, default=0,
                        help='管理员 user_id（默认 0 = 查找第一个 admin 用户）')
    parser.add_argument('--count', type=int, default=5,
                        help='生成数量（默认 5）')
    parser.add_argument('--db-type', type=str, default=None,
                        help='数据库类型（sqlite/mysql/postgres，默认从 DP_DB_TYPE 环境变量读取）')
    args = parser.parse_args()

    if args.db_type:
        os.environ['DP_DB_TYPE'] = args.db_type

    db = get_db()

    user_id = args.user_id
    if user_id == 0:
        # 自动查找第一个 admin 用户
        admin = db.fetchone("SELECT id, username FROM users WHERE role = 'admin' LIMIT 1")
        if admin:
            user_id = admin['id']
            print(f"找到管理员: {admin['username']} (id={user_id})")
        else:
            # 查找第一个用户（注册时自动成为 admin）
            first_user = db.fetchone("SELECT id, username FROM users ORDER BY id LIMIT 1")
            if first_user:
                user_id = first_user['id']
                print(f"未找到 admin，使用第一个用户: {first_user['username']} (id={user_id})")
            else:
                print("错误: 数据库中没有任何用户。请先注册第一个用户（自动成为管理员）。")
                print("注册方式: 访问网站 → /register → 不填邀请码（第一个用户无需邀请码）")
                sys.exit(1)

    print(f"\n生成 {args.count} 个邀请码：\n" + "=" * 30)
    for i in range(args.count):
        code = create_invite_code(user_id)
        print(f"  {i+1}. {code}")
    print("=" * 30)
    print(f"\n以上邀请码已存入数据库，可分享给新用户注册使用。")


if __name__ == '__main__':
    main()
