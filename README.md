# Better Patter Meter
又一个（大概会更准确的）乐曲速度检测，基于 HTML/JavaScript  
Yet another probably-more-precise music tempo analysis based on HTML/JavaScript  
さらにもう一つのテンポアナライザ、おそらくより正確になります。HTML/JavaScript に基づきます

## :heavy_check_mark: Under construction

USACO 弃坑啦 ◡ ヽ(`Д´)ﾉ ┻━┻ 

## 算法

咦这里有一篇大大们的论文qwq

[田 垅,刘宗田.最小二乘法分段直线拟合\[J\].计算机科学,2012,39(Z6):482-484](http://www.jsjkx.com/jsjkx/ch/reader/view_abstract.aspx?file_no=12006128&flag=1)

~~（话说泥萌给了个算法都不分析复杂度啊啊啊啊啊~~

然后窝们发现可以还可以改进。。用 DP 解决全局最小值。。。嗯

### 动态规划

用 `est[i, j]` 和 `err[i, j]` 分别表示 `i .. j` 号点的 SLR 斜率值和误差值（取 PCC<sup>5</sup>）。  
用 `f[i, k]` 表示 `0 .. i` 号点分成 `k` 段的最小代价（误差值总和）。

那末有边界条件：`f[-1, 0] = 0`（咦这个 -1 哪里冒出来的 = =）

然后使用 push 类型的状态转移方程：  
`f[i, k] + err[i + 1, j] --min-→ f[j, k + 1]`  
对于每个 `i, k`，枚举 `j = i + 8 .. N - 1` 转移即可（+8 是为了防止各种乱入的小段）

最后对每一个 `k`，对 `f[n - 1, k]` 进行一下估价 `Eval(k, f[n - 1, k])` 然后取最优值就可以啦～  
状态转移的时候记录下前驱就可以方便地得到转移路线从而获得具体分段方案～

时间复杂度 _O_(_n_<sup>2</sup> · _k_<sub>max</sub>)

### 普通地优化一下

窝们发现前面拍击的时候程序一直闲着没事做 = =  
让它一边接受拍击一边算 DP 吧！

普通地瞄了一眼之后发现转移方程可以改成 pull：  
`f[i, k] = min[0 <= j < i - 8] { f[j, k - 1] + err[j + 1, i] }`

然后窝们就可以愉快地在第 _i_ 次拍击之后算出 `f[i, *]` 的值啦～单次拍击处理过程时间复杂度 _O_(_n_ · _k_<sub>max</sub>)
