import json
import os
import time
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from app.utils.database import get_db_connection
from app.routes.admin import admin_auth_required

blogs_bp = Blueprint('blogs', __name__)

# Uploads directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads', 'blogs')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp', 'gif'}
ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'webm', 'mov', 'ogg'}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS.union(ALLOWED_VIDEO_EXTENSIONS)


def allowed_file(filename, allowed_extensions):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions


def save_uploaded_file(file):
    if file and allowed_file(file.filename, ALLOWED_EXTENSIONS):
        filename = secure_filename(file.filename)
        filename = f"{int(time.time())}_{filename}"
        dest = os.path.join(UPLOAD_FOLDER, filename)
        file.save(dest)
        return f"/uploads/blogs/{filename}"
    return None


def make_absolute_url(path):
    if not path or not isinstance(path, str):
        return path
    if path.startswith('http://') or path.startswith('https://'):
        return path
    if path.startswith('/'):
        host_url = request.url_root.rstrip('/')
        return f"{host_url}{path}"
    return path


def get_image_full_url(image_path, image_url=None):
    if image_path:
        return make_absolute_url(image_path)
    if image_url and isinstance(image_url, str) and image_url.startswith('/'):
        return make_absolute_url(image_url)
    return image_url


def load_content_blocks(content_text):
    if not content_text:
        return []
    if isinstance(content_text, list):
        return content_text
    try:
        return json.loads(content_text)
    except Exception:
        return []


def get_video_preview_url(url):
    if not isinstance(url, str):
        return None
    try:
        parsed = url if url.startswith('http') else f'https://{url.lstrip('/')}'
        from urllib.parse import urlparse, parse_qs
        u = urlparse(parsed)
        if 'youtube.com' in u.hostname or 'youtu.be' in u.hostname:
            if 'youtu.be' in u.hostname:
                video_id = u.path.lstrip('/')
            else:
                qs = parse_qs(u.query)
                video_id = qs.get('v', [None])[0]
            if video_id:
                return f'https://img.youtube.com/vi/{video_id}/hqdefault.jpg'
        if 'vimeo.com' in u.hostname:
            video_id = u.path.strip('/').split('/')[-1]
            if video_id:
                return f'https://vumbnail.com/{video_id}.jpg'
    except Exception:
        return None
    return None


def find_preview_image_from_blocks(blocks):
    if not isinstance(blocks, list):
        return None
    for block in blocks:
        if not isinstance(block, dict):
            continue
        block_type = block.get('type')
        if block_type == 'hero-image':
            if block.get('image_url'):
                return block['image_url']
            if block.get('image_path'):
                return block['image_path']
        if block_type == 'image-gallery':
            for image in block.get('images', []):
                if image.get('image_url'):
                    return image['image_url']
                if image.get('image_path'):
                    return image['image_path']
        if block_type == 'two-column':
            if block.get('image_url'):
                return block['image_url']
            if block.get('image_path'):
                return block['image_path']
        if block_type == 'video':
            preview = get_video_preview_url(block.get('url'))
            if preview:
                return preview
    return None


def normalize_block_media_urls(blocks):
    if not isinstance(blocks, list):
        return blocks
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if block.get('image_path') and isinstance(block['image_path'], str) and block['image_path'].startswith('/'):
            block['image_path'] = make_absolute_url(block['image_path'])
        if block.get('image_url') and isinstance(block['image_url'], str) and block['image_url'].startswith('/'):
            block['image_url'] = make_absolute_url(block['image_url'])
        if block.get('url') and isinstance(block['url'], str) and block['url'].startswith('/'):
            block['url'] = make_absolute_url(block['url'])
        if block.get('type') == 'image-gallery':
            for image in block.get('images', []):
                if not isinstance(image, dict):
                    continue
                if image.get('image_path') and isinstance(image['image_path'], str) and image['image_path'].startswith('/'):
                    image['image_path'] = make_absolute_url(image['image_path'])
                if image.get('image_url') and isinstance(image['image_url'], str) and image['image_url'].startswith('/'):
                    image['image_url'] = make_absolute_url(image['image_url'])
    return blocks


def process_block_uploads(blocks):
    if not isinstance(blocks, list):
        return blocks

    for block in blocks:
        if not isinstance(block, dict):
            continue

        upload_field = block.get('upload_field')
        if upload_field:
            file = request.files.get(upload_field)
            saved = save_uploaded_file(file)
            if saved:
                if block.get('type') == 'video':
                    block['url'] = saved
                    block['source'] = 'upload'
                else:
                    block['image_path'] = saved
                block.pop('upload_field', None)
                block.pop('image_url', None)

        if block.get('type') == 'image-gallery':
            images = block.get('images', [])
            for image in images:
                if not isinstance(image, dict):
                    continue
                upload_field = image.get('upload_field')
                if upload_field:
                    file = request.files.get(upload_field)
                    saved = save_uploaded_file(file)
                    if saved:
                        image['image_path'] = saved
                        image.pop('upload_field', None)
                        image.pop('image_url', None)

    return blocks


def build_blog_response(row):
    content = row['content']
    blocks = load_content_blocks(content)
    blocks = normalize_block_media_urls(blocks)
    if isinstance(content, str) and not blocks and content.strip():
        parsed_content = content
    else:
        parsed_content = blocks

    preview_image = get_image_full_url(row['image_path'], row['image_url'])
    if not preview_image:
        preview_image = find_preview_image_from_blocks(blocks)
    if preview_image and isinstance(preview_image, str) and preview_image.startswith('/'):
        preview_image = make_absolute_url(preview_image)

    return {
        'id': row['id'],
        'title': row['title'],
        'description': row['description'],
        'author': row['author'],
        'publish_date': row['publish_date'],
        'content': parsed_content,
        'image_path': row['image_path'],
        'image_url': row['image_url'],
        'image_full_url': preview_image,
        'video_url': row['video_url'],
        'category': row['category'],
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
    }


@blogs_bp.route('/blogs', methods=['GET'])
def list_blogs():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM blogs ORDER BY created_at DESC')
    rows = cursor.fetchall()
    conn.close()

    blogs = [build_blog_response(row) for row in rows]
    return jsonify(blogs), 200


@blogs_bp.route('/blogs/<int:blog_id>', methods=['GET'])
def get_blog(blog_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM blogs WHERE id = ?', (blog_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return jsonify({'error': 'Blog not found'}), 404

    return jsonify(build_blog_response(row)), 200


@blogs_bp.route('/admin/blogs', methods=['POST'])
@admin_auth_required
def create_blog():
    payload = request.get_json(silent=True) or {}
    title = request.form.get('title') or payload.get('title')
    description = request.form.get('description') or payload.get('description')
    author = request.form.get('author') or payload.get('author')
    publish_date = request.form.get('publish_date') or payload.get('publish_date')
    category = request.form.get('category') or payload.get('category')
    content_raw = request.form.get('content') or payload.get('content')

    blocks = load_content_blocks(content_raw)
    if blocks:
        blocks = process_block_uploads(blocks)
        content_to_store = json.dumps(blocks)
    else:
        content_to_store = content_raw or ''

    image_path = None
    if 'image' in request.files:
        file = request.files['image']
        image_path = save_uploaded_file(file)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        '''INSERT INTO blogs (title, description, author, publish_date, content, image_path, image_url, video_url, category)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (title, description, author, publish_date, content_to_store, image_path, request.form.get('image_url') or payload.get('image_url'), request.form.get('video_url') or payload.get('video_url'), category)
    )
    conn.commit()
    blog_id = cursor.lastrowid
    cursor.execute('SELECT * FROM blogs WHERE id = ?', (blog_id,))
    row = cursor.fetchone()
    conn.close()

    return jsonify({'message': 'Blog created', 'blog': build_blog_response(row)}), 201


@blogs_bp.route('/admin/blogs/<int:blog_id>', methods=['PUT'])
@admin_auth_required
def update_blog(blog_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM blogs WHERE id = ?', (blog_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Blog not found'}), 404

    payload = request.get_json(silent=True) or {}
    title = request.form.get('title') or payload.get('title')
    description = request.form.get('description') or payload.get('description')
    author = request.form.get('author') or payload.get('author')
    publish_date = request.form.get('publish_date') or payload.get('publish_date')
    category = request.form.get('category') or payload.get('category')
    content_raw = request.form.get('content') or payload.get('content')

    blocks = load_content_blocks(content_raw)
    if blocks:
        blocks = process_block_uploads(blocks)
        content_to_store = json.dumps(blocks)
    else:
        content_to_store = content_raw or row['content']

    image_path = row['image_path']
    if 'image' in request.files:
        file = request.files['image']
        uploaded_path = save_uploaded_file(file)
        if uploaded_path:
            if image_path:
                old = os.path.join(BASE_DIR, image_path.lstrip('/').replace('/', os.sep))
                try:
                    if os.path.exists(old):
                        os.remove(old)
                except Exception:
                    pass
            image_path = uploaded_path

    cursor.execute(
        '''UPDATE blogs SET title = ?, description = ?, author = ?, publish_date = ?, content = ?, image_path = ?, image_url = ?, video_url = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?''',
        (
            title or row['title'],
            description or row['description'],
            author or row['author'],
            publish_date or row['publish_date'],
            content_to_store,
            image_path,
            request.form.get('image_url') or payload.get('image_url') or row['image_url'],
            request.form.get('video_url') or payload.get('video_url') or row['video_url'],
            category or row['category'],
            blog_id,
        )
    )
    conn.commit()
    cursor.execute('SELECT * FROM blogs WHERE id = ?', (blog_id,))
    updated = cursor.fetchone()
    conn.close()

    return jsonify({'message': 'Blog updated', 'blog': build_blog_response(updated)}), 200


@blogs_bp.route('/admin/blogs/<int:blog_id>', methods=['DELETE'])
@admin_auth_required
def delete_blog(blog_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM blogs WHERE id = ?', (blog_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Blog not found'}), 404

    image_path = row['image_path']
    if image_path:
        file_path = os.path.join(BASE_DIR, image_path.lstrip('/').replace('/', os.sep))
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass

    cursor.execute('DELETE FROM blogs WHERE id = ?', (blog_id,))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Blog deleted'}), 200


@blogs_bp.route('/uploads/blogs/<path:filename>', methods=['GET'])
def serve_uploaded_image(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)
