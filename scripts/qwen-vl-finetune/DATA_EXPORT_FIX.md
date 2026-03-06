# PTCG Qwen-VL 数据导出修复指南

## 问题：Prisma 客户端未生成

### 错误信息
```
RuntimeError: The Client hasn't been generated yet, you must run `prisma generate`
```

## 解决方案

### 方法 1: 使用项目现有的 Prisma 配置

```bash
# 1. 进入项目根目录
cd c:\AI_Server\Coding\PTCG_2026

# 2. 安装依赖（如果未安装）
pnpm install

# 3. 生成 Prisma 客户端
cd packages\database
pnpm exec prisma generate

# 4. 返回并运行导出脚本
cd ..\..\scripts\qwen-vl-finetune
python export_training_data.py --samples 1800
```

### 方法 2: 手动安装 Prisma CLI

```bash
# 全局安装 Prisma
npm install -g prisma

# 生成客户端
prisma generate --schema=c:\AI_Server\Coding\PTCG_2026\packages\database\prisma\schema.prisma

# 运行导出
python export_training_data.py --samples 1800
```

### 方法 3: 使用 Python 脚本修复

```bash
python fix_prisma.py
```

---

## 完整数据导出流程

### 步骤 1: 确保数据库连接正常

检查 `.env` 文件中的 `DATABASE_URL`:

```bash
DATABASE_URL="postgresql://postgres:password@localhost:5432/ptcg_2026"
```

### 步骤 2: 生成 Prisma 客户端

```bash
cd c:\AI_Server\Coding\PTCG_2026\packages\database
pnpm exec prisma generate
```

成功输出：
```
✔ Generated Prisma Client (v5.x.x) to ./node_modules/@prisma/client
```

### 步骤 3: 导出数据

```bash
cd c:\AI_Server\Coding\PTCG_2026\scripts\qwen-vl-finetune

# 导出 1800 张卡牌（不预处理图像，更快）
python export_training_data.py --samples 1800 --output-dir ./datasets

# 或者启用图像预处理（推荐，但更慢）
python export_training_data.py --samples 1800 --output-dir ./datasets --preprocess-images
```

### 步骤 4: 验证数据

```bash
python validate_dataset.py --dataset-dir ./datasets
```

### 步骤 5: 运行测试

```bash
python benchmark_simple.py --model-path ./outputs/final --samples 50
```

---

## 常见错误及解决

### 错误：数据库连接失败

```
✗ 数据库连接失败：connection refused
```

**解决:**
1. 确保 PostgreSQL 服务正在运行
2. 检查 `.env` 文件中的数据库连接字符串
3. 验证数据库凭据正确

```bash
# 测试数据库连接
psql -U postgres -h localhost -d ptcg_2026
```

### 错误：权限被拒绝

```
EPERM: operation not permitted, rename ...
```

**解决:**
1. 关闭所有可能占用 Prisma 的进程（Node.js、VSCode 等）
2. 以管理员身份运行命令提示符
3. 重试生成

```bash
# 以管理员身份运行 CMD，然后：
cd c:\AI_Server\Coding\PTCG_2026\packages\database
pnpm exec prisma generate
```

### 错误：没有卡牌数据

```
总共查询到 0 张卡牌
```

**解决:**
这意味着数据库中没有卡牌数据。需要先运行爬虫或导入数据。

```bash
# 检查数据库中是否有卡牌
cd c:\AI_Server\Coding\PTCG_2026\packages\database
pnpm exec prisma studio
```

在 Prisma Studio 中查看 `Card` 表是否有数据。

---

## 快速修复脚本

运行自动修复脚本：

```bash
python fix_prisma.py
```

然后：

```bash
python export_training_data.py --samples 1800
```

---

## 如果数据库没有数据

如果数据库中没有卡牌数据，您需要：

1. **运行爬虫导入数据**:
   ```bash
   cd c:\AI_Server\Coding\PTCG_2026
   # 运行现有的爬虫脚本导入卡牌数据
   ```

2. **或手动导入示例数据**:
   创建一个简单的 JSON 文件并导入到数据库

3. **或使用测试模式**（不需要数据库）:
   ```bash
   python test_no_db.py
   ```

---

## 联系支持

如果以上方法都无效，请：
1. 检查项目 README.md
2. 查看 DATABASE_MIGRATION_GUIDE.md
3. 确保 PostgreSQL 和所有依赖已正确安装
