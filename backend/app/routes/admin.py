import os
import secrets
from functools import wraps
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from app.utils.database import get_db_connection, hash_password, verify_password

admin_bp = Blueprint('admin', __name__)

ADMIN_TOKENS = {}


def generate_token():
    return secrets.token_urlsafe(32)


def admin_auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Unauthorized'}), 401

        token = auth_header.split(' ', 1)[1].strip()
        user = ADMIN_TOKENS.get(token)
        if not token or not user:
            return jsonify({'error': 'Unauthorized'}), 401

        # attach user to flask.g
        g.admin_user = user
        return fn(*args, **kwargs)

    return wrapper


def super_admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = getattr(g, 'admin_user', None)
        if not user or user.get('role') != 'super_admin':
            return jsonify({'error': 'Access denied'}), 403
        return fn(*args, **kwargs)

    return wrapper


@admin_bp.route('/admin/login', methods=['POST'])
def admin_login():
    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'error': 'Request body must be JSON'}), 400

    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password are required'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, username, password_hash, role FROM admin_users WHERE username = ?', (username,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'error': 'Invalid username or password'}), 401

    if not verify_password(password, row['password_hash']):
        conn.close()
        return jsonify({'success': False, 'error': 'Invalid username or password'}), 401

    token = generate_token()
    ADMIN_TOKENS[token] = {'id': row['id'], 'username': row['username'], 'role': row['role']}

    # update last_login
    cursor.execute('UPDATE admin_users SET last_login = ? WHERE id = ?', (datetime.utcnow().isoformat(), row['id']))
    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'token': token,
        'admin': {
            'id': row['id'],
            'username': row['username'],
            'role': row['role'],
        }
    }), 200


@admin_bp.route('/admin/logout', methods=['POST'])
@admin_auth_required
def admin_logout():
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.split(' ', 1)[1].strip() if ' ' in auth_header else ''
    ADMIN_TOKENS.pop(token, None)
    return jsonify({'success': True, 'message': 'Logged out successfully'}), 200


@admin_bp.route('/admin/me', methods=['GET'])
@admin_auth_required
def admin_me():
    user = g.admin_user
    return jsonify({'id': user['id'], 'username': user['username'], 'role': user['role']}), 200


@admin_bp.route('/admin/stats', methods=['GET'])
@admin_auth_required
def admin_stats():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT COUNT(*) AS total FROM products')
    total_products = cursor.fetchone()['total']

    cursor.execute('SELECT COUNT(*) AS total FROM contacts')
    total_inquiries = cursor.fetchone()['total']

    today = datetime.utcnow().strftime('%Y-%m-%d')
    cursor.execute(
        "SELECT COUNT(*) AS total FROM contacts WHERE DATE(created_at) = ?",
        (today,)
    )
    todays_inquiries = cursor.fetchone()['total']

    conn.close()

    return jsonify({
        'total_products': total_products,
        'total_inquiries': total_inquiries,
        'todays_inquiries': todays_inquiries,
    }), 200


@admin_bp.route('/admin/inquiries', methods=['GET'])
@admin_auth_required
def get_inquiries():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, name, organization, email, phone, inquiry_type, message, created_at
        FROM contacts
        ORDER BY created_at DESC
    ''')
    rows = cursor.fetchall()
    conn.close()

    inquiries = [
        {
            'id': row['id'],
            'name': row['name'],
            'organization': row['organization'],
            'email': row['email'],
            'phone': row['phone'],
            'inquiry_type': row['inquiry_type'],
            'message': row['message'],
            'created_at': row['created_at'],
        }
        for row in rows
    ]

    return jsonify(inquiries), 200


@admin_bp.route('/admin/inquiries/<int:inquiry_id>', methods=['DELETE'])
@admin_auth_required
def delete_inquiry(inquiry_id):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM contacts WHERE id = ?', (inquiry_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Inquiry not found'}), 404

    cursor.execute('DELETE FROM contacts WHERE id = ?', (inquiry_id,))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Inquiry deleted successfully'}), 200


# -------------------- Admin Users (Sub-admin) Management --------------------


@admin_bp.route('/admin/users', methods=['GET'])
@admin_auth_required
@super_admin_required
def list_admin_users():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, username, role, created_at, last_login FROM admin_users ORDER BY created_at DESC')
    rows = cursor.fetchall()
    conn.close()

    users = [
        {
            'id': r['id'],
            'username': r['username'],
            'role': r['role'],
            'created_at': r['created_at'],
            'last_login': r['last_login'],
        }
        for r in rows
    ]
    return jsonify(users), 200


@admin_bp.route('/admin/users', methods=['POST'])
@admin_auth_required
@super_admin_required
def create_admin_user():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'username and password are required'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        password_hash = hash_password(password)
        cursor.execute('INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)', (username, password_hash, 'sub_admin'))
        conn.commit()
        new_id = cursor.lastrowid
        cursor.execute('SELECT id, username, role, created_at, last_login FROM admin_users WHERE id = ?', (new_id,))
        row = cursor.fetchone()
        user = {
            'id': row['id'], 'username': row['username'], 'role': row['role'], 'created_at': row['created_at'], 'last_login': row['last_login']
        }
        return jsonify({'user': user}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': 'Could not create user', 'details': str(e)}), 400
    finally:
        conn.close()


@admin_bp.route('/admin/users/<int:user_id>', methods=['PUT'])
@admin_auth_required
@super_admin_required
def update_admin_user(user_id):
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, username, role FROM admin_users WHERE id = ?', (user_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    updates = []
    params = []
    if username:
        updates.append('username = ?')
        params.append(username)
    if password:
        updates.append('password_hash = ?')
        params.append(hash_password(password))

    if updates:
        params.append(user_id)
        cursor.execute(f"UPDATE admin_users SET {', '.join(updates)} WHERE id = ?", tuple(params))
        conn.commit()

    cursor.execute('SELECT id, username, role, created_at, last_login FROM admin_users WHERE id = ?', (user_id,))
    updated = cursor.fetchone()
    conn.close()
    return jsonify({'user': {'id': updated['id'], 'username': updated['username'], 'role': updated['role'], 'created_at': updated['created_at'], 'last_login': updated['last_login']}}), 200


@admin_bp.route('/admin/users/<int:user_id>', methods=['DELETE'])
@admin_auth_required
@super_admin_required
def delete_admin_user(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM admin_users WHERE id = ?', (user_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'User not found'}), 404

    cursor.execute('DELETE FROM admin_users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'User deleted'}), 200
