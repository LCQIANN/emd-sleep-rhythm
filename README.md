# 睡眠的節律：EMD 互動實驗室

為 2026/09/24 黃鍔院士演講「EMD 在睡眠上的研究」所做的互動演算法網站。

- 手繪訊號即時 EMD 分解
- 篩選（sifting）逐步視覺化
- 連續睡眠深度滑桿：IMF 自動對應節律、iPDF 峰度（Huang et al. 2025）、EMD 慢波量 vs. N3 二元標籤（Sun et al. 2026）
- HHSA 巢狀 EMD：慢振盪對紡錘波的調幅（Huang et al. 2016）

所有演算法皆以原生 JavaScript 從頭實作於 `emd.js`，純靜態網站，無建置步驟。

## 部署

- Zeabur：匯入此 GitHub repo，自動辨識為 static site。
- GitHub Pages：Settings → Pages → Deploy from branch `main` / root。
