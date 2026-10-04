SHELL := /bin/sh
.DEFAULT_GOAL := help
PORT ?= 8788
export PORT
.PHONY: help setup run dev build sites-build start check

help:
	@echo "栖点 · Next.js + shadcn/ui"
	@echo "make setup        安装依赖"
	@echo "make run / dev    启动本地开发站点（默认 8788）"
	@echo "make run PORT=3000 使用指定端口启动"
	@echo "make build        构建生产版本"
	@echo "make sites-build  构建 Sites 静态版本"
	@echo "make start        启动生产版本（先 build）"
	@echo "make check        检查代码、类型和校验测试"

setup:
	npm install

run:
	npm run dev

dev: run

build:
	npm run build

sites-build:
	npm run build:sites

start:
	npm start

check:
	npm run check
