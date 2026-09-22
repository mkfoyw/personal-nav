SHELL := /bin/sh
.DEFAULT_GOAL := help
.PHONY: help setup run dev bridge build sites-build start mongo-check check

help:
	@echo "栖点 · Next.js + shadcn/ui"
	@echo "make setup        安装依赖"
	@echo "make run / dev    启动本地开发站点（默认 8788）"
	@echo "make bridge       启动 Sites 本地数据桥接（默认 8788）"
	@echo "make build        构建生产版本"
	@echo "make sites-build  构建 Sites 静态版本"
	@echo "make start        启动生产版本（先 build）"
	@echo "make mongo-check  检查本地 MongoDB"
	@echo "make check        检查代码、类型和校验测试"

setup:
	npm install

run:
	npm run dev

dev: run

bridge:
	npm run bridge

build:
	npm run build

sites-build:
	npm run build:sites

start:
	npm start

check:
	npm run check

mongo-check:
	@node --input-type=module -e 'import nextEnv from "@next/env"; import { MongoClient } from "mongodb"; nextEnv.loadEnvConfig(process.cwd()); const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017/", { serverSelectionTimeoutMS: 2500 }); try { await client.connect(); await client.db(process.env.MONGODB_DB || "personal_nav").command({ ping: 1 }); console.log("MongoDB 已连接"); } catch { console.error("MongoDB 连接失败，请先启动本机 MongoDB。"); process.exitCode = 1; } finally { await client.close(); }'
