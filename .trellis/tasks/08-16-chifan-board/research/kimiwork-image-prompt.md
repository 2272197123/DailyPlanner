# kimiwork 生图提示词：像素风食物缩略图

> 用法：把下面的「通用前缀 + 单菜描述」拼起来发给 kimiwork，每道菜一张。
> 建议尺寸 256×256 或 512×512，PNG。文件命名为菜品记录里的 `image` 字段（如 `mapo-tofu.png`）。

## 通用提示词模板

```
像素画风格（pixel art, 16-bit retro game style），一道中餐菜品图标：<菜品英文名或描述>，
俯视 45 度视角盛在简洁的碗/盘里，居中构图，饱满色彩，明暗对比清晰，
干净的纯色深背景（#1a1b26），无文字无水印，游戏道具图标质感，边缘清晰锯齿感像素颗粒
```

英文版（生图模型通常英文更稳）：

```
Pixel art, 16-bit retro game item icon: <dish name in English>, served in a simple
bowl/plate, 45-degree top-down view, centered composition, vibrant colors, clean
shading, solid dark background (#1a1b26), no text, no watermark, crisp pixel edges,
video game inventory icon style
```

## 批量清单（示例 12 道，完整清单随菜品库起草后给出）

| 文件名 | 填入 <dish> 的内容 |
|---|---|
| mapo-tofu.png | mapo tofu, red spicy sauce with tofu cubes in a bowl |
| kungpao-chicken.png | kung pao chicken with peanuts and dried chilies |
| tomato-egg.png | Chinese tomato and egg stir fry |
| fried-rice.png | yangzhou fried rice with shrimp and peas |
| beef-noodles.png | Taiwanese beef noodle soup with rich broth |
| xiaolongbao.png | xiaolongbao soup dumplings in a bamboo steamer |
| hotpot.png | mini Sichuan hotpot with red spicy broth |
| peking-duck.png | sliced Peking duck with pancakes |
| sweet-sour-pork.png | sweet and sour pork (gulao rou) with pineapple |
| lamian.png | hand-pulled lanzhou lamian noodles in clear broth |
| curry-rice.png | Japanese curry rice with potato and carrot |
| sushi-set.png | small sushi and sashimi set on a wooden plate |

## 验收口径

- 全套图风格一致（同 prompt 模板只换菜品名）
- 深色背景统一 #1a1b26（卡片正面底色与之匹配）
- 每道菜 1 张即可；第一批建议 20 道高频菜，后续补充
