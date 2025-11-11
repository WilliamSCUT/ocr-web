# 故障排查指南

## 问题：ocr-web 容器不断重启

### 1. 查看容器日志（最重要）

```bash
# 查看 ocr-web 容器的实时日志
docker compose logs -f ocr-web

# 或者查看最近 100 行日志
docker compose logs --tail=100 ocr-web

# 查看所有服务的日志
docker compose logs
```

**关键信息**：日志会显示容器启动失败的具体原因，常见错误包括：
- 文件找不到（如 `dist/index.js`）
- 模块导入错误
- 端口被占用
- 环境变量问题

### 2. 检查容器内部文件结构

```bash
# 进入容器（如果容器能短暂运行）
docker compose exec ocr-web sh

# 或者直接检查文件
docker compose exec ocr-web ls -la /app
docker compose exec ocr-web ls -la /app/dist
docker compose exec ocr-web ls -la /app/public
```

### 3. 检查构建过程

```bash
# 重新构建并查看详细输出
docker compose build --no-cache ocr-web

# 查看构建日志中的错误
```

### 4. 手动测试启动

```bash
# 停止当前容器
docker compose stop ocr-web

# 以前台模式运行（可以看到实时输出）
docker compose run --rm ocr-web node dist/index.js

# 或者直接运行容器
docker compose run --rm ocr-web sh
# 然后在容器内手动运行
# node dist/index.js
```

### 5. 检查环境变量

```bash
# 查看容器环境变量
docker compose exec ocr-web env

# 或者
docker inspect ocr-web-ocr-web-1 | grep -A 20 "Env"
```

### 6. 常见问题及解决方案

#### 问题 A：找不到 dist/index.js
**原因**：TypeScript 编译失败或文件路径不对
**解决**：
```bash
# 检查构建是否成功
docker compose build ocr-web

# 检查 dist 目录是否存在
docker compose run --rm ocr-web ls -la /app/dist
```

#### 问题 B：模块导入错误
**原因**：生产依赖缺失或版本不匹配
**解决**：
```bash
# 重新构建
docker compose build --no-cache ocr-web
```

#### 问题 C：端口被占用
**原因**：3001 端口已被其他服务占用
**解决**：
```bash
# 检查端口占用
sudo lsof -i :3001
# 或
sudo netstat -tlnp | grep 3001

# 修改 docker-compose.yml 中的端口映射
# ports:
#   - "3002:3001"  # 改为其他端口
```

#### 问题 D：静态文件路径错误
**原因**：`STATIC_DIR` 路径解析错误
**解决**：检查 `server/index.ts` 中的路径解析逻辑

### 7. 完整重建流程

如果以上都不行，尝试完全重建：

```bash
# 停止并删除所有容器
docker compose down

# 删除镜像（可选）
docker rmi ocr-web-ocr-web

# 清理构建缓存
docker builder prune

# 重新构建并启动
docker compose build --no-cache
docker compose up -d

# 查看日志
docker compose logs -f ocr-web
```

## 关于 docker-compose 启动时没有输出

这是**正常的**！因为：
- `docker compose up -d` 中的 `-d` 表示后台（detached）模式
- 所有输出都会进入日志，不会显示在终端

要查看输出，使用：
```bash
docker compose logs -f
```

## OCR 服务健康检查无输出

`curl http://127.0.0.1:8118/health` 没有输出可能有几种情况：
1. **服务正常但没有 /health 端点**：这是正常的，PaddleOCR-VL 可能不提供这个端点
2. **服务异常**：检查日志
   ```bash
   docker compose logs paddleocr-vllm
   ```

要验证 OCR 服务是否真的在运行：
```bash
# 检查容器状态
docker compose ps paddleocr-vllm

# 查看日志
docker compose logs --tail=50 paddleocr-vllm

# 测试 API 端点（如果知道的话）
curl http://127.0.0.1:8118/v1/models
```

