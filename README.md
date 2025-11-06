# Formula OCR Web

基于 PaddleOCR-VL 服务的公式识别网页应用，支持拖拽/粘贴/上传图片，实时返回并渲染 LaTeX 公式。

## 功能特性

-  **多种输入方式**：拖拽、点击上传、粘贴（Ctrl+V）
-  **自动识别**：上传后自动调用 OCR 服务
-  **实时渲染**：使用 MathJax 渲染 LaTeX 公式
-  **智能压缩**：大图自动等比压缩（长边 > 2000px → 1600px）
-  **响应式设计**：支持桌面端和移动端

## 快速开始

### 1. 安装 Node.js

如果运行 `npm` 命令提示 `Command 'npm' not found`，需要先安装 Node.js。

**推荐方式（使用 Conda）**：

```bash
# 如果您已经安装了 Conda
conda install -c conda-forge nodejs

# 验证安装
node --version  # 需要 >= 18
npm --version
```

**其他方式**：

```bash
# 使用 nvm（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20

# 或使用 apt + NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. 安装项目依赖

```bash
cd ocr-web

# 方式 1: 使用安装脚本
chmod +x setup.sh
./setup.sh

# 方式 2: 手动安装
npm run install:all
```

### 3. 配置环境变量

```bash
cd server
cp .env.example .env
nano .env  # 或使用其他编辑器
```

编辑 `server/.env`，**必须**设置 `OCR_BASE`：

```env
# PaddleOCR GenAI 服务地址（必填）
OCR_BASE=http://127.0.0.1:8118/v1

# 其他配置（可选）
OCR_MODEL=PaddleOCR-VL-0.9B
PORT=3001
MAX_FILE_MB=8
```

### 4. 启动服务

```bash
# 返回项目根目录
cd ..

# 启动前后端（推荐）
npm run dev
```

或分开启动（便于调试）：

```bash
# 终端 1 - 启动后端
cd server
npm run dev

# 终端 2 - 启动前端
cd web
npm run dev
```

### 5. 访问应用

打开浏览器访问：http://localhost:5173

## 验证安装

```bash
# 检查后端健康状态
curl http://127.0.0.1:3001/health
# 应返回: {"status":"ok","timestamp":"..."}

# 检查 PaddleOCR 服务
curl http://127.0.0.1:8118/health
# 应返回 200 状态码
```

## 项目结构

```
ocr-web/
├── server/              # Node.js 后端服务
│   ├── index.ts         # Express 服务器
│   ├── index.test.ts    # 单元测试
│   └── .env             # 环境变量配置
├── web/                 # React 前端应用
│   └── src/
│       ├── App.tsx      # 主组件
│       ├── api.ts       # API 调用
│       └── utils/       # 工具函数
├── package.json         # 根项目配置
├── nginx.conf.sample    # Nginx 配置示例
├── Dockerfile           # Docker 构建文件
└── README.md            # 本文件
```

## 开发命令

```bash
# 开发模式（前后端同时启动）
npm run dev

# 单独启动
npm run dev:server   # 仅后端
npm run dev:web      # 仅前端

# 测试
npm test             # 运行单元测试

# 构建
npm run build:web    # 构建前端
npm run build:server # 构建后端
```

## 生产部署

### 方式 1: Docker（推荐）

```bash
# 构建镜像
docker build -t ocr-web .

# 运行容器
docker run -d \
  -p 3001:3001 \
  -e OCR_BASE=http://host.docker.internal:8118/v1 \
  --name ocr-web \
  --restart unless-stopped \
  ocr-web
```

### 方式 2: Nginx + systemd

```bash
# 1. 构建前后端
npm run build:web
npm run build:server

# 2. 部署文件
sudo mkdir -p /var/www/ocr-web
sudo cp -r web/dist/* /var/www/ocr-web/
sudo cp -r server/dist /var/www/ocr-web/server/
sudo cp server/package*.json /var/www/ocr-web/server/
cd /var/www/ocr-web/server && sudo npm ci --only=production

# 3. 配置环境变量
sudo cp server/.env /var/www/ocr-web/server/.env

# 4. 配置 systemd
sudo cp ocr-web.service /etc/systemd/system/
sudo systemctl enable --now ocr-web

# 5. 配置 Nginx
sudo cp nginx.conf.sample /etc/nginx/sites-available/ocr-web
sudo ln -s /etc/nginx/sites-available/ocr-web /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

详细 Nginx 配置请查看 `nginx.conf.sample`。

## API 说明

### POST /api/ocr

识别公式图片，返回 LaTeX。

**请求格式**：`multipart/form-data`，字段 `image`

**成功响应**：
```json
{
  "latex": "E=mc^2",
  "raw": "E=mc^2",
  "request_id": "abc123"
}
```

**错误码**：
- `400`: 无文件或类型不支持
- `413`: 文件过大
- `502`: PaddleOCR 服务错误
- `504`: 请求超时

## 常见问题

### Q: 启动时提示 `tsx: not found`

**A:** 这个问题已修复。确保使用最新的 `package.json`：

```bash
# 更新后，npm run dev 会正确调用 server/npm run dev
git pull  # 如果是从 git 克隆的
npm run dev
```

### Q: 上传图片后提示 500 错误

**A:** 检查后端是否启动：

```bash
curl http://127.0.0.1:3001/health
```

如果连接被拒绝，说明后端未启动。检查：
1. `server/.env` 文件是否存在
2. `OCR_BASE` 配置是否正确
3. 查看终端中的后端日志

### Q: 识别很慢或超时

**A:** 

1. 检查 PaddleOCR 服务是否正常运行
2. 调整超时设置（`server/.env` 中的 `UPSTREAM_TIMEOUT`）
3. 查看后端日志中的耗时信息

### Q: Docker 容器无法访问本地 PaddleOCR 服务

**A:** 使用 `host.docker.internal` 代替 `127.0.0.1`：

```bash
docker run -e OCR_BASE=http://host.docker.internal:8118/v1 ...
```

### Q: 前后端分开启动正常，一起启动失败

**A:** 已在最新版本修复。确保：
- 根目录运行过 `npm install`（安装 concurrently）
- server 和 web 目录都运行过 `npm install`

## 技术栈

- **前端**: React 18 + TypeScript + Vite + MathJax 3
- **后端**: Node.js 20 + Express + TypeScript
- **部署**: Nginx / Docker

## 环境要求

- Node.js >= 18
- npm >= 9
- PaddleOCR GenAI vLLM 服务（运行在 8118 端口）

## 许可证

MIT License

## 相关链接

- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)
- [MathJax](https://www.mathjax.org/)

---

**Powered by Zellin**
