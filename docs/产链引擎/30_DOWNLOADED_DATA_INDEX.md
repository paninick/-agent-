# 已下载数据索引

> **更新日期**：2026-06-30
> **目的**：记录 D:\Downloads 中与产业链情报相关的数据文件
> **使用原则**：仅引用，不修改原文件

---

## 一、日本海关相关数据

### 1.1 日本海关 HS 编码手册

```
文件: Japan_CTS_HS02_Rev1.xlsx
路径: D:\Downloads\Japan_CTS_HS02_Rev1.xlsx
内容: 日本海关 HS02 编码修订版
用途: 对照日本进口数据时使用 HS 编码映射
优先级: P1 (提高分析精度)
状态: ✓ 已下载
处理方式: 
  - 不必导入系统，仅在解码日本数据时参考
  - 日本海关数据用 9 位 HS 编码，比 Comtrade 6 位更细
```

### 1.2 日本贸易地图 2025 进出口数据

```
文件 1: Trade_Map_-_List_of_products_at_2_digits_level_exported_by_Japan_in_2025.xls
路径: D:\Downloads\Trade_Map_-_List_of_products_at_2_digits_level_exported_by_Japan_in_2025.xls
内容: 日本 2025 年 2 位 HS 出口产品列表
用途: 知道日本出口了什么 → 反推日本生产什么

文件 2: Trade_Map_-_List_of_products_at_2_digits_level_imported_by_Japan_in_2025.xls
路径: D:\Downloads\Trade_Map_-_List_of_products_at_2_digits_level_imported_by_Japan_in_2025.xls
内容: 日本 2025 年 2 位 HS 进口产品列表
用途: 知道日本从哪国进口什么（与 Comtrade 互验）
优先级: P0 (核心数据)
状态: ✓ 已下载
处理方式:
  - 这些是 ITC Trade Map 的导出文件
  - 可作为 Comtrade 的镜像数据
  - 解码后存入 Obsidian 知识库
```

---

## 二、其他可能相关的数据

### 2.1 项目内部文件（已瘦身）

```
文件: (已瘦身)服装工厂经营升级方案_日系服装TOP风格_证据案例岗位KPI_动画版.pptx
路径: D:\Downloads\(已瘦身)服装工厂经营升级方案_日系服装TOP风格_证据案例岗位KPI_动画版.pptx
内容: 富泉内部 PPT 模板，包含日本服装 TOP 风格、案例、KPI
状态: ✓ 已下载
备注: 这可能包含富泉的内部 KPI 数据
      注意 L2 安全等级 - 仅本地存储，不上 ima
```

### 2.2 设计参考

```
目录: nantong_japan_sakura_knit_horizontal/
路径: D:\Downloads\nantong_japan_sakura_knit_horizontal\
内容: 南通日本樱花针织宣传视频（横屏）
用途: 富泉日本风格参考素材
备注: 业务相关但非数据源
```

### 2.3 待处理的海量文件

```
D:\Downloads\ 下还有大量未分类文件:
  - 各种 PDF / 视频 / 压缩包
  - 多个 1#2# 厂区相关文件
  - yonyou 财务系统相关数据
  - jimeng AI 生成图片
  - 各种聊天记录截图

需要分类整理才能用，建议暂不处理
```

---

## 三、待下载的日本海关数据

基于 customs.go.jp 内容，重要的官方数据源：

### 3.1 日本贸易统计 - 月度数据

```
URL: https://www.customs.go.jp/toukei/info/index.htm
类型: 月度贸易统计（HS 9 位）
更新: 每月 25-30 日
状态: 需要下载或自动抓取
```

### 3.2 日本财务统计 - 时间序列

```
URL: https://www.customs.go.jp/toukei/suii/html/time.htm
类型: 月度时间序列数据
状态: 需要下载或自动抓取
```

### 3.3 最新统计

```
URL: https://www.customs.go.jp/toukei/latest/index.htm
类型: 月度最新数据
状态: 需要下载或自动抓取
```

---

## 四、数据源验证状态

### 4.1 已验证可用

```
✓ D:\Downloads\Japan_CTS_HS02_Rev1.xlsx
  - HS02 编码（6 位基础）→ 9 位细化
  - 用于精确化日本进出口分析
  - 可读取（xlsx 格式）

✓ D:\Downloads\Trade_Map_-_List_of_products_at_2_digits_level_*_in_2025.xls
  - 2025 年日本进出口
  - HS 2 位粒度
  - 可读取（xls 格式）
  - 与 Comtrade 互验
```

### 4.2 待处理

```
○ D:\Downloads\customs.go.jp 表格（用户已下载部分）
  - 需要确认具体文件名
  - 状态: 待用户确认
```

### 4.3 不相关

```
✗ 厂区建施 PDF/DWG 文件 - 工程图纸，与数据源无关
✗ yonyou 财务数据 - 内部系统数据，L3 安全等级
✗ 各种视频文件 - 业务素材，非数据源
```

---

## 五、下一步数据采集计划

### 5.1 P0 - 本周完成

```
□ 自动抓取 https://www.customs.go.jp/toukei/latest/index.htm 最新月度数据
□ 将已下载的 Trade Map 2025 数据解码入库
□ 验证 Japan_CTS_HS02_Rev1.xlsx 完整性和字段
```

### 5.2 P1 - 本月完成

```
□ 抓取 customs.go.jp 2024-2025 全部月度数据
□ 建立自动化解析脚本
□ 存储到 Obsidian 知识库
```

### 5.3 P2 - 长期

```
□ 抓取历史 5 年数据用于趋势分析
□ 整合到统一证据账本
□ 建立日→周→月三层快照
```

---

## 六、安全注意事项

```
所有 D:\Downloads 中的文件:
  - 仅本地访问，不上传
  - 不在云端备份敏感内容
  - 引用时标注 L1/L2/L3 等级
  - 富泉相关文件标注 L2（仅本地）

具体:
  Japan_CTS_HS02_Rev1.xlsx → L0 (公开)
  Trade_Map_2025.xls → L0 (公开)
  服装工厂经营升级方案.pptx → L2 (富泉内部)
  厂区建施文件 → L2 (富泉内部)
  yonyou 财务数据 → L3 (富泉机密)
```