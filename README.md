# Better Patter Meter
又一个（大概会更准确的）乐曲速度检测，基于 HTML/JavaScript  
Yet another probably-more-precise music tempo analysis based on HTML/JavaScript  
さらにもう一つのテンポアナライザ、おそらくより正確になります。HTML/JavaScript に基づきます

## :disappointed: Pondering

窝的作业。。好像快要做完了。。啊不还有地理作业。。手动再见

有没有漏掉什么。。(´Д` ) 好方好方好方啊啊啊啊

## 算法

### 综述
首先窝们用 `n` 表示拍击的次数，每次拍击的时刻为 `t[i]` (0 ≦ i < n)。  
然后规定 `est[i, j]` 和 `err[i, j]` (0 ≦ i ≦ j - 7 < n - 7) 分别表示 \[i, i + 1, …, j\] 段内的速度估计值 & 估计值和真实值的误差。具体实现在后面。  
（7 是为了保证每一段至少有一定长度（8 个点），防止不合理估计）  
接下来进行动态规划：`f[i, k]` (0 ≦ i < n, 1 ≦ 10) 表示 \[0, 1, …, i\] 段，分成 `k` 个不同速度的段，总误差的最小值。  
最后对每个 `f[n - 1, k]` 进行估价 `h[k] = Eval(k, f[n - 1, k])`。最后取使得 `h[k]` 最大的 `k`，沿 DP 转移路线取回所有决策，获得相应的 `est` 值即可。

是不是很滋瓷呀～（不

### 数组 `f` 的 DP
为了方便取得转移路线，在转移的同时记录上一步的状态 `prec[i, k]`。

* 初始化：`f[i, k] = Infinity, prec[i, k] = Undefined`
* 边界条件：`f[7, 1] = err[0, 7], prec[7, 1] = {-1, -1}`
* 状态转移方程（push 形式）：  
  `f[i, k] + err[i + 1, j] --min-→ f[j, k + 1]`  
  在一次更新成功之后更新 `prec[j, k + 1] = {i, k}`。

### `est` 和 `err` 的预先计算
