(function (window) {
  var bpm = {
    // TODO: Add configuration, make customizable
  };
  window.requestAnimationFrame = window.requestAnimationFrame
    || window.mozRequestAnimationFrame
    || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

  bpm.init_display = function (canvas) {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = 240;
  };

  var ease_cubic_in = function (x) {
    return x * x * x;
  };
  var ease_cubic_out = function (x) {
    return 1 - (1 - x) * (1 - x) * (1 - x);
  };

  var rgb_interpolate = function (r1, g1, b1, r2, g2, b2, x) {
    if (x <= 0) return 'rgb(' + r1.toString() + ',' + g1.toString() + ',' + b1.toString() + ')';
    else if (x >= 1) return 'rgb(' + r2.toString() + ',' + g2.toString() + ',' + b2.toString() + ')';
    return 'rgb(' + Math.round(r1 + (r2 - r1) * x).toString() + ',' +
      Math.round(g1 + (g2 - g1) * x).toString() + ',' +
      Math.round(b1 + (b2 - b1) * x).toString() + ')';
  };
  var num_interpolate = function (a, b, x) {
    if (x <= 0) return a; else if (x >= 1) return b; else return a + (b - a) * x;
  };

  var get_regression = function (sum, wgh, sqr, l, r) {
    var n = r - l + 1;
    var avg_x = (l + r) / 2;
    var avg_y = (sum[r] - sum[l - 1]) / n;
    var intv_sum = sum[r] - sum[l - 1];
    var intv_wgh = wgh[r] - wgh[l - 1];
    var intv_sqr = sqr[r] - sqr[l - 1];
    var sigma_i_sqr = (r * (r + 1) * (r + r + 1) - l * (l - 1) * (l + l - 1)) / 6;
    // numr = Sigma[i = l..r] (i - avg_x) * (a[i] - avg_y)
    //      = (Sigma i * a[i]) - (avg_x * Sigma a[i])
    //        + (avg_y * Sigma (i - avg_x))   -> equals 0
    //      = (Sigma i * a[i]) - (avg_x * Sigma a[i])
    var numr = intv_wgh - (avg_x * intv_sum);
    // deno = Sigma[i = l..r] (i - avg_x) * (i - avg_x)
    //      = Sigma[i = l..r] (i^2 - 2 * i * avg_x + avg_x^2)
    //      = (Sigma i^2) - 2 * avg_x * (Sigma i) + n * avg_x^2
    //      = (Sigma i^2) - n * avg_x^2
    var deno = sigma_i_sqr - n * avg_x * avg_x;
    // pcc = (n * (Sigma i * a[i]) - (Sigma i) * (Sigma a[i]))
    //        / sqrt((n * (Sigma i^2) - (Sigma i) ^ 2) * (n * (Sigma a[i]^2) - (Sigma a[i]) ^ 2))
    var pcc = (n * intv_wgh - n * avg_x * intv_sum)
              / Math.sqrt((n * sigma_i_sqr - n * n * avg_x * avg_x) * (n * intv_sqr - intv_sum * intv_sum));
    return [numr / deno, 1 - Math.pow(pcc, 6)];
  };

  bpm.process_pat = function (time) {
    if (this.start_time === -1) this.start_time = time;
    time -= this.start_time;
    this.records.push(time);
    // [1] Calculate estimations
    var estimation_str = '---';
    if (this.records.length > 8) {
      // Average of:
      // (1) Median of the intervals
      // (2) Slope of line P0_P8
      var intv_list = [0, 0, 0, 0, 0, 0, 0, 0];
      for (var i = 0; i < 8; ++i)
        intv_list[i] = this.records[this.records.length - 1 - i] - this.records[this.records.length - 2 - i];
      intv_list.sort(function (a, b) { return a - b; });
      // (3) Ignore cases where the beats are unstable
      if (intv_list[7] - intv_list[0] <= intv_list[7] * 0.5) {
        var e1 = 60000.0 / ((intv_list[3] + intv_list[4]) / 2);
        var e2 = 60000.0 / ((this.records[this.records.length - 1] - this.records[this.records.length - 9]) / 8);
        var estimation = (e1 + e2) / 2;
        estimation_str = Math.round(estimation).toString();
      }
    }
    while (estimation_str.length < 3) estimation_str = ' ' + estimation_str;
    this.last_eststr = this.cur_eststr;
    this.cur_eststr = estimation_str;
    // [2] Update regression
    this.pfx_sum[this.records.length - 1] = this.pfx_sum[this.records.length - 2] + time;
    this.pfx_wgh[this.records.length - 1] = this.pfx_wgh[this.records.length - 2] + time * (this.records.length - 1);
    this.pfx_sqr[this.records.length - 1] = this.pfx_sqr[this.records.length - 2] + time * time;
    // [3] Dynamic programming
    // Pull: f[i, k] = min[0 <= j < i - 8] { f[j, k - 1] + err[j + 1, i] }
    var cur_row = [], cur_row_prec = [], cur_val, cur_min, min_idx;
    if (this.records.length < 8) {
      cur_row[1] = Infinity;
    } else {
      cur_row[1] = get_regression(this.pfx_sum, this.pfx_wgh, this.pfx_sqr, 0, this.records.length - 1)[1];
    }
    cur_row_prec[1] = -1;
    for (var k = 2; k < 10; ++k) {
      cur_min = Infinity;
      min_idx = -1;
      for (var j = 0; j < this.records.length - 8; ++j) { // or -9? Whatever.
        cur_val = this.dyn_pro[j][k - 1] + get_regression(this.pfx_sum, this.pfx_wgh, this.pfx_sqr, j + 1, this.records.length - 1)[1];
        if (cur_min > cur_val) {
          cur_min = cur_val;
          min_idx = j;
        }
      }
      cur_row[k] = cur_min;
      cur_row_prec[k] = min_idx;
    }
    this.dyn_pro.push(cur_row);
    this.dyn_pro_route.push(cur_row_prec);
  };

  bpm.calc_results = function () {
    var min_err = Infinity, min_err_k = -1;
    for (var i = 1; i < 10; ++i) {
      if (min_err > this.dyn_pro[this.dyn_pro.length - 1][i]) {
        min_err = this.dyn_pro[this.dyn_pro.length - 1][i];
        min_err_k = i;
      }
    }
    var route = [], cur_idx = this.dyn_pro.length - 1;
    for (; cur_idx !== -1; cur_idx = this.dyn_pro_route[cur_idx][min_err_k--]) {
      route.push(cur_idx);
    }
    route.push(0);
    route.reverse();
    // XXX: Use map() or reduce()?
    this.final_results = [];
    for (var i = 1; i < route.length; ++i) {
      this.final_results.push([route[i], 60000.0 / get_regression(this.pfx_sum, this.pfx_wgh, this.pfx_sqr, route[i - 1], route[i])[0]]);
    }
    console.log(this.final_results);
  };

  bpm.draw_history_and_estimation = function (dt) {
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    // History
    var history_ct = Math.ceil(w / 160) + 1;
    this.drawctx.fillStyle = '#bbbb88';
    for (var i = 0; i < Math.min(history_ct, this.records.length - 1); ++i) {
      this.drawctx.beginPath();
      var x = w - i * 160 - 80 + Math.max(0, Math.pow(1 - dt / 200, 3)) * 160 + 10,
          y = h - h * (this.records[this.records.length - 1 - i] - this.records[this.records.length - 2 - i]) / 1500;
      if (this.is_finished) {
        x = w - i * 160 - 70;
        // Ease / back (x = 2.5): http://javascript.info/tutorial/animation
        if (dt < 300) {
          var d = dt / 300;
          y = y + (h + 10 - y) * (d * d * (3.5 * d - 2.5));
        } else {
          y = h + 10;
        }
      }
      this.drawctx.arc(x, y, 10, 0, 2 * Math.PI);
      this.drawctx.fill();
      this.drawctx.fillRect(x - 3.09, y, 6.18, h - y);
    }
    // Estimation
    if (this.is_finished) {
      this.drawctx.fillStyle = 'rgba(135, 135, 85, ' + (1 - dt / 100).toString() + ')';
    } else {
      this.drawctx.fillStyle = '#999955';
    }
    this.drawctx.font = '34px Droid Sans Mono, Source Code Pro, Menlo, Courier New, Monospace';
    this.drawctx.textBaseline = 'bottom';
    var text_size = this.drawctx.measureText('Est.');
    this.drawctx.fillText('Est.', w - text_size.width - 6, h * 0.5);
    this.drawctx.font = '64px Droid Sans Mono, Source Code Pro, Menlo, Courier New, Monospace';
    this.drawctx.textBaseline = 'top';
    text_size = this.drawctx.measureText('m');  // Assertion: font must be monospace
    for (var i = 0; i < 3; ++i) {
      if (!this.is_finished && dt < 200 && this.cur_eststr[i] !== this.last_eststr[i]) {
        var dir = (this.cur_eststr[i] < this.last_eststr[i] ? 1 : -1);
        this.drawctx.fillStyle = 'rgba(135, 135, 85, ' + (1 - dt / 200).toString() + ')';
        this.drawctx.fillText(this.last_eststr[i], w - text_size.width * (3 - i) - 6, h * 0.5 + dir * 20 * ease_cubic_in(dt / 200));
        this.drawctx.fillStyle = 'rgba(135, 135, 85, ' + (dt / 200).toString() + ')';
        this.drawctx.fillText(this.cur_eststr[i], w - text_size.width * (3 - i) - 6, h * 0.5 - dir * 20 * (1 - ease_cubic_out(dt / 200)));
      } else {
        this.drawctx.fillText(this.cur_eststr[i], w - text_size.width * (3 - i) - 6, h * 0.5);
      }
    }
  };

  bpm.draw_finishing = function (dt) {
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    // 0 ~ 1.5 s: Display all history
    // 1.5 ~ 2 s: Sleep
    this.drawctx.fillStyle = 'rgba(0, 0, 0, 128)';
    if (!this._p_x) {
      this._p_x = [ 4 ];
      this._p_y = [ h - 4 ];
      for (var i = 1; i < this.records.length; ++i) {
        this._p_x[i] = 4 + (w - 8) * i / (this.records.length - 1);
        this._p_y[i] = h - 4 - (h - 8) * this.records[i] / (this.records[this.records.length - 1]);
      }
    }
    var cur_idx = Math.min(this.records.length, Math.floor(dt / 1500 * this.records.length));
    for (var i = 0; i < cur_idx; ++i) {
      this.drawctx.beginPath();
      this.drawctx.arc(this._p_x[i], this._p_y[i], 4, 0, 2 * Math.PI);
      this.drawctx.fill();
      if (i > 0) {
        this.drawctx.beginPath();
        this.drawctx.moveTo(this._p_x[i - 1], this._p_y[i - 1]);
        this.drawctx.lineTo(this._p_x[i], this._p_y[i]);
        this.drawctx.stroke();
      }
    }
    if (dt < 1500) {
      var prog = (dt / 1500 * this.records.length - cur_idx);
      this.drawctx.beginPath();
      this.drawctx.arc(this._p_x[cur_idx], this._p_y[cur_idx], 4 * prog, 0, 2 * Math.PI);
      this.drawctx.fill();
      if (cur_idx > 0) {
        this.drawctx.beginPath();
        this.drawctx.moveTo(this._p_x[i - 1], this._p_y[i - 1]);
        this.drawctx.lineTo(
          num_interpolate(this._p_x[i - 1], this._p_x[i], prog),
          num_interpolate(this._p_y[i - 1], this._p_y[i], prog));
        this.drawctx.stroke();
      }
    }
    // Analysis results
    else if (dt > 2000) {
      cur_idx = Math.min(this.final_results.length - 1, Math.floor((dt - 2000) / 180 * this.final_results.length));
      var last_x = 0;
      for (var i = 0; i <= cur_idx; ++i) {
        var prog = Math.min(1, (dt - (2000 + i * 180)) / 180);
        //if (dt < 2500 && i == 0) console.log(dt, cur_idx, prog);
        this.drawctx.fillStyle = 'rgba(0, 0, 0, ' + (prog * 0.3).toString() + ')';
        this.drawctx.fillRect(last_x, 0, this.final_results[i][0] / (this.records.length - 1) * w, h);
        last_x = this.final_results[i][0] / (this.records.length - 1) * w;
      }
    }
  };

  bpm.refresh_display = function () {
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    var dt = Date.now() - this.last_pat;
    this.drawctx.clearRect(0, 0, w, h);
    // Background
    if (this.is_finished) {
      this.drawctx.fillStyle = rgb_interpolate(0xff, 0xff, 0xcc, 0xff, 0xff, 0xff, dt / 100);
    } else {
      // #ccddaa -> #ffffcc
      if (this.records.length === 0) {
        this.drawctx.fillStyle = '#ccddaa';
      } else if (this.records.length === 1) {
        this.drawctx.fillStyle = rgb_interpolate(0xcc, 0xdd, 0xaa, 0xff, 0xff, 0xcc, dt / 100);
      } else {
        this.drawctx.fillStyle = '#ffffcc';
      }
    }
    this.drawctx.fillRect(0, 0, w, h);
    if (this.records.length === 0) return;
    if (this.is_finished) {
      if (dt > 400) this.draw_finishing(dt - 100);
      else this.draw_history_and_estimation(dt);
      if (dt < 20000) window.requestAnimationFrame(this.ticker);
    } else {
      this.draw_history_and_estimation(dt);
      if (dt < 200) window.requestAnimationFrame(this.ticker);
    }
  };

  bpm.pat = function () {
    if (this.is_finished) return;
    this.last_pat = Date.now();
    this.process_pat(this.last_pat);
    window.requestAnimationFrame(this.ticker);
  };

  bpm.finish = function () {
    this.is_finished = true;
    this.last_pat = Date.now();
    this.calc_results();
    window.requestAnimationFrame(this.ticker);
  };

  bpm.create = function (id) {
    if (typeof id !== 'string') {
      console.log('BPM.create(): id cannot be null');
      return undefined;
    }
    var canvas = document.getElementById(id);
    if (!canvas || canvas.tagName.toUpperCase() !== 'CANVAS') {
      console.log('BPM.create(): id should correspond to a <canvas> element');
      return false;
    }
    bpm.init_display(canvas);
	
    var ret = {};
    // Properties
    ret.canvas = canvas;
    ret.drawctx = canvas.getContext('2d');
    ret.last_pat = Date.now();
    ret.last_eststr = '---';
    ret.cur_eststr = '---';
    ret.start_time = -1;
    ret.records = [];
    ret.pfx_sum = []; ret.pfx_sum[-1] = 0;
    ret.pfx_wgh = []; ret.pfx_wgh[-1] = 0;
    ret.pfx_sqr = []; ret.pfx_sqr[-1] = 0;
    ret.dyn_pro = [];
    ret.dyn_pro_route = [];
    ret.is_finished = false;
    // Methods
    ret.process_pat = bpm.process_pat;
    ret.calc_results = bpm.calc_results;
    ret.draw_history_and_estimation = bpm.draw_history_and_estimation;
    ret.draw_finishing = bpm.draw_finishing;
    ret.refresh_display = bpm.refresh_display;
    ret.pat = bpm.pat;
    ret.finish = bpm.finish;
    // Timers
    ret.ticker = (function (_ret) { return function () { _ret.refresh_display(); }; })(ret);
    window.requestAnimationFrame(ret.ticker);
    return ret;
  };

  window.bpm = bpm;
})(window);
