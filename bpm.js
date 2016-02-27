(function (window) {
  //////////  Preparations  //////////
  var req_anim_frame = window.requestAnimationFrame
    || window.mozRequestAnimationFrame
    || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

  //////////  Constructor  //////////
  var bpm = function (id) {
    if (typeof id !== 'string') {
      console.log('BPM.create(): id cannot be null');
      return undefined;
    }
    var canvas = document.getElementById(id);
    if (!canvas || canvas.tagName.toUpperCase() !== 'CANVAS') {
      console.log('BPM.create(): id should correspond to a <canvas> element');
      return false;
    }
    this.init_display(canvas);

    this.canvas = canvas;
    this.drawctx = canvas.getContext('2d');
    this.last_pat = Date.now();
    this.last_pat_is_undo = false;
    this.last_undo_record = -1;
    this.tot_break = 0;
    this.breaking = false;  // or time of last 'break'
    this.last_eststr = '---';
    this.cur_eststr = '---';
    this.start_time = -1;
    this.records = [];
    this.pfx_sum = []; this.pfx_sum[-1] = 0;
    this.pfx_wgh = []; this.pfx_wgh[-1] = 0;
    this.pfx_sqr = []; this.pfx_sqr[-1] = 0;
    this.dyn_pro = [];
    this.dyn_pro_route = [];
    this.is_finished = false;
    this.is_results_displayed = false;
    // Timers
    this.ticker = (function (_ret) { return function () { _ret.refresh_display(); }; })(this);
    req_anim_frame(this.ticker);
    // Event handlers and preview-related stuff
    this.is_dragging = false;
    this.drag_start_x = -1;
    this.drag_start_time = -1;
    this.drag_current_x = -1;
    this.drag_end_time = -1;
    this.drag_range_est = [0, 0];
    canvas.addEventListener('mousedown', (function (_self) { return function (e) { _self.handle_mousedown(e); }; })(this));
    canvas.addEventListener('mousemove', (function (_self) { return function (e) { _self.handle_mousemove(e); }; })(this));
    canvas.addEventListener('mouseup', (function (_self) { return function (e) { _self.handle_mouseup(e); }; })(this));
  };

  //////////  Configurations  //////////
  bpm.font = 'Droid Sans Mono, Source Code Pro, Menlo, Courier New, Monospace';

  //////////  Protected methods and functions  //////////
  bpm.prototype.init_display = function (canvas) {
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
  var rgb_interpolate_obj = function (o1, o2, x) {
    if (x <= 0) return o1; else if (x >= 1) return o2;
    else return {
      r: Math.round(o1.r + (o2.r - o1.r) * x),
      g: Math.round(o1.g + (o2.g - o1.g) * x),
      b: Math.round(o1.b + (o2.b - o1.b) * x)
    };
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

  bpm.prototype.calc_estimation = function () {
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
  };
  bpm.prototype.process_pat = function (time) {
    if (this.start_time === -1) this.start_time = time;
    time -= this.start_time;
    this.records.push(time);
    // [1] Calculate estimations
    this.calc_estimation();
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
      cur_row[1] = get_regression(this.pfx_sum, this.pfx_wgh, this.pfx_sqr, 2, this.records.length - 3)[1];
    }
    cur_row_prec[1] = -1;
    for (var k = 2; k < 10; ++k) {
      cur_min = Infinity;
      min_idx = -1;
      for (var j = 0; j < this.records.length - 8; ++j) { // or -9? Whatever.
        cur_val = this.dyn_pro[j][k - 1] + get_regression(this.pfx_sum, this.pfx_wgh, this.pfx_sqr, j + 3, this.records.length - 3)[1];
        if (cur_min > cur_val) {
          cur_min = cur_val;
          min_idx = j;
        }
      }
      cur_row[k] = cur_min;
      cur_row_prec[k] = min_idx;
    }
    this.dyn_pro[this.records.length - 1] = cur_row;
    this.dyn_pro_route[this.records.length - 1] = cur_row_prec;
  };

  bpm.prototype.calc_results = function () {
    var min_err = Infinity, min_err_k = -1;
    for (var i = 1; i < 10; ++i) {
      if (min_err > this.dyn_pro[this.records.length - 1][i]) {
        min_err = this.dyn_pro[this.records.length - 1][i];
        min_err_k = i;
      }
    }
    var route = [], cur_idx = this.records.length - 1;
    for (; cur_idx !== -1; cur_idx = this.dyn_pro_route[cur_idx][min_err_k--]) {
      route.push(cur_idx);
    }
    route.push(0);
    route.reverse();
    // XXX: Use map() or reduce()?
    this.final_results = [];
    for (var i = 1; i < route.length; ++i) {
      this.final_results.push([route[i], 60000.0 / get_regression(this.pfx_sum, this.pfx_wgh, this.pfx_sqr, route[i - 1] + 2, route[i] - 2)[0]]);
    }
  };

  bpm.prototype.draw_history_and_estimation = function (dt) {
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    // History
    var history_ct = Math.ceil(w / 160) + 1;
    this.drawctx.fillStyle = '#bbbb88';
    for (var i = (this.last_pat_is_undo ? -1 : 0); i < Math.min(history_ct, this.records.length - 1); ++i) {
      this.drawctx.beginPath();
      var record_delta = (this.last_pat_is_undo && i === -1) ?
        (this.last_undo_record - this.records[this.records.length - 1]) :
        (this.records[this.records.length - 1 - i] - this.records[this.records.length - 2 - i]);
      var x = w - i * 160 - 80 + (this.last_pat_is_undo ? -1 : 1) * Math.max(0, Math.pow(1 - dt / 200, 3)) * 160 + 10,
          y = h - h * record_delta / 1500;
      if (this.is_finished) {
        x = w - i * 160 - 70;
        // Ease / back (x = 2.5): http://javascript.info/tutorial/animation
        if (dt < 300) {
          var d = dt / 300;
          y = y + (h + 10 - y) * (d * d * (3.5 * d - 2.5));
        } else {
          y = h + 10;
        }
      } else if (this.breaking) {
        x = w - i * 160 - 70;
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
    this.drawctx.font = '34px ' + bpm.font;
    this.drawctx.textBaseline = 'bottom';
    var text_size = this.drawctx.measureText('Est.');
    this.drawctx.fillText('Est.', w - text_size.width - 6, h * 0.5);
    this.drawctx.font = '64px ' + bpm.font;
    this.drawctx.textBaseline = 'top';
    text_size = this.drawctx.measureText('m');  // Assertion: font must be monospace
    for (var i = 0; i < 3; ++i) {
      if (!this.is_finished && !this.breaking && dt < 200 && this.cur_eststr[i] !== this.last_eststr[i]) {
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

  var hsv_to_rgb = function (obj) {
    var c = obj.v * obj.s;
    var h = obj.h / 60;
    var x = c * (1 - Math.abs(h % 2 - 1));
    var r = 0, g = 0, b = 0;
    switch (true) {
      case (h >= 5): r = c; b = x; break;
      case (h >= 4): r = x; b = c; break;
      case (h >= 3): g = x; b = c; break;
      case (h >= 2): g = c; b = x; break;
      case (h >= 1): r = x; g = c; break;
      case (h >= 0): r = c; g = x; break;
      default: break;
    }
    return {
      r: Math.floor((r + obj.v - c) * 255),
      g: Math.floor((g + obj.v - c) * 255),
      b: Math.floor((b + obj.v - c) * 255)
    };
  };
  // Copyright (C) uoj.ac 2014-2016
  var get_rating_colour = function (rating) {
    if (rating < 1500) {
      var H = 2000/11, S = 1900/33, V = 2300/33;
      if (rating < 300) rating = 300;
      var k = (rating - 300) / 1200;
      return hsv_to_rgb({h: H + (300 - H) * (1 - k), s: (30 + (S - 30) * k) / 100, v: (50 + (V - 50) * k) / 100});
    }
    if (rating > 2500) {
      rating = 2500;
    }
    return hsv_to_rgb({h: (5000 - rating * 2) / 11, s: rating * 7/16500 - 2/33, v: rating / 3300 + 8/33});
  };
  var get_tempo_colour = function (bpm) {
    // Map BPM to UOJ rating
    // [0, 108, 208] → [540, 1500, 2500]
    return get_rating_colour(bpm * 10 + 420);
  };
  bpm.prototype.draw_finishing = function (dt) {
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    // 0 ~ 1.5 s: Display all history
    // 1.5 ~ 2 s: Sleep
    this.drawctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    if (!this._p_x) {
      this._p_x = [ 4 ];
      this._p_y = [ h - 4 ];
      for (var i = 1; i < this.records.length; ++i) {
        this._p_x[i] = 4 + (w - 8) * i / (this.records.length - 1);
        this._p_y[i] = h - 4 - (h - 8) * this.records[i] / (this.records[this.records.length - 1]);
      }
    }
    var cur_idx = Math.min(this.records.length, Math.floor((dt - 300) / 1200 * this.records.length));
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
      var prog = ((dt - 300) / 1200 * this.records.length - cur_idx);
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
      var drag_opacity_mult = this.is_dragging ?
        Math.max(0, 1 - (Date.now() - this.drag_start_time) / 180) :
        Math.max(0, Math.min(1, (Date.now() - this.drag_end_time - 3000) / 180));
      cur_idx = Math.min(this.final_results.length - 1, Math.floor((dt - 2000) / 180));
      var last_x = 0, cur_x;
      for (var i = 0; i <= cur_idx; ++i) {
        var prog = Math.min(1, (dt - (2000 + i * 180)) / 180);
        var c = get_tempo_colour(this.final_results[i][1]);
        cur_x = this.final_results[i][0] / (this.records.length - 1) * w;
        this.drawctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ', ' + (prog * 0.3 * drag_opacity_mult).toString() + ')';
        this.drawctx.fillRect(last_x, 0, cur_x - last_x, h);

        this.drawctx.fillStyle = 'rgba(0, 0, 0, ' + (prog * 0.66 * drag_opacity_mult).toString() + ')';
        this.drawctx.font = '44px ' + bpm.font;
        this.drawctx.textBaseline = 'middle';
        var text = Math.round(this.final_results[i][1]).toString();
        var text_w = this.drawctx.measureText(text).width;
        this.drawctx.fillText(text, (last_x + cur_x - text_w) / 2, h * (0.382 + 0.05 * i));
        this.drawctx.font = '24px ' + bpm.font;
        text = (this.final_results[i][1] - Math.round(this.final_results[i][1])).toFixed(2);
        if (text[0] !== '-') text = '+' + text;
        text_w = this.drawctx.measureText(text).width;
        this.drawctx.fillText(text, (last_x + cur_x - text_w) / 2, h * ((i <= 5 ? 0.502 : 0.262) + 0.05 * i));
        last_x = cur_x;
      }
      if (dt > 2000 + this.final_results.length * 180) this.is_results_displayed = true;
    }
    // Dragging?
    if (this.is_dragging || this.drag_end_time >= Date.now() - 3000) {
      var c = this.is_dragging ? { r: 0, g: 0, b: 0 } :
        rgb_interpolate_obj({ r: 0, g: 0, b: 0 }, get_tempo_colour(60000.0 / this.drag_range_est[0]), (Date.now() - this.drag_end_time) / 180);
      var opacity = this.is_dragging ? 1 : Math.min(1, (3000 - Date.now() + this.drag_end_time) / 180);
      this.drawctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ', ' + (opacity * 0.3).toString() + ')';
      var x1 = Math.min(this.drag_start_x, this.drag_current_x),
          x2 = Math.max(this.drag_start_x, this.drag_current_x);
      this.drawctx.fillRect(x1, 0, x2 - x1, h);
      if (!this.is_dragging) {
        opacity = Math.min(opacity, (Date.now() - this.drag_end_time) / 180);
        this.drawctx.fillStyle = 'rgba(0, 0, 0, ' + (opacity * 0.66).toString() + ')';
        this.drawctx.font = '44px ' + bpm.font;
        var text = (60000.0 / this.drag_range_est[0]).toFixed(2);
        var text_w = this.drawctx.measureText(text).width;
        this.drawctx.fillText(text, (this.drag_start_x + this.drag_end_x - text_w) / 2, h * (0.382 + 0.05 * i));
        this.drawctx.font = '24px ' + bpm.font;
        text = 'err ' + (this.drag_range_est[1] * 100).toFixed(2) + '%';
        text_w = this.drawctx.measureText(text).width;
        this.drawctx.fillText(text, (this.drag_start_x + this.drag_end_x - text_w) / 2, h * ((i <= 5 ? 0.502 : 0.262) + 0.05 * i));
      }
    }
  };
  bpm.prototype.handle_mousedown = function (e) {
    if (this.is_results_displayed) {
      // Tested. Will work when canvas is in multiple cascaded div's or something.
      var x = e.clientX - this.canvas.offsetLeft;
      this.is_dragging = true;
      this.drag_start_x = x;
      this.drag_current_x = x;
      this.drag_start_time = Date.now();
      if (this.drag_end_time >= Date.now() - 3000)
        this.drag_start_time -= 180;
      this.drag_end_time = -1;
      req_anim_frame(this.ticker);
    }
  };
  bpm.prototype.handle_mousemove = function (e) {
    if (this.is_dragging) {
      var x = e.clientX - this.canvas.offsetLeft;
      this.drag_current_x = x;
    }
  };
  bpm.prototype.handle_mouseup = function (e) {
    if (this.is_results_displayed) {
      var w = this.canvas.clientWidth;
      var x = e.clientX - this.canvas.offsetLeft;
      this.is_dragging = false;
      this.drag_end_time = Date.now();
      this.drag_end_x = x;
      var x1, x2;
      x1 = Math.min(this.drag_start_x, this.drag_end_x);
      x2 = Math.max(this.drag_start_x, this.drag_end_x);
      var st = Math.min(this.records.length - 1, Math.max(0, Math.ceil((x1 - 4) / ((w - 8) / (this.records.length - 1)))));
      var ed = Math.min(this.records.length - 1, Math.max(0, Math.floor((x2 - 4) / ((w - 8) / (this.records.length - 1)))));
      if (ed < st + 1) {
        this.drag_end_time -= 3000; // Do not hold if few points are selected.
      }
      this.drag_range_est = get_regression(this.pfx_sum, this.pfx_wgh, this.pfx_sqr, st, ed)
    }
  };

  bpm.prototype.refresh_display = function () {
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
      } else if (this.records.length === 1 && !this.last_pat_is_undo) {
        this.drawctx.fillStyle = rgb_interpolate(0xcc, 0xdd, 0xaa, 0xff, 0xff, 0xcc, dt / 100);
      } else {
        if (this.breaking) {
          if (dt <= 160) {
            this.drawctx.fillStyle = rgb_interpolate(0xee, 0xee, 0xaa, 0xff, 0xff, 0xcc, Math.abs(80 - dt) / 80);
          } else {
            this.drawctx.fillStyle = '#ffffcc';
          }
        } else {
          this.drawctx.fillStyle = '#ffffcc';
        }
      }
    }
    this.drawctx.fillRect(0, 0, w, h);
    if (this.records.length === 0) return;
    if (this.is_finished) {
      if (dt > 400) this.draw_finishing(dt - 100);
      else this.draw_history_and_estimation(dt);
      if (dt < 2200 + this.final_results.length * 180
        || this.is_dragging || this.drag_end_time > Date.now() - 4000)
      {
        req_anim_frame(this.ticker);
      }
    } else {
      this.draw_history_and_estimation(dt);
      if (dt < 200) req_anim_frame(this.ticker);
    }
  };

  //////////  Public methods  //////////
  bpm.prototype['pat'] = function () {
    if (this.is_finished) return;
    this.last_pat = Date.now();
    this.last_pat_is_undo = false;
    if (this.breaking) {
      // Should be this.records[this.records.length - 1] + this.last_pat - this.breaking
      // Will be this.last_pat - this.tot_break - this.start_time after adjustments
      this.tot_break = this.breaking - this.records[this.records.length - 1] - this.start_time;
      this.breaking = false;
    }
    this.process_pat(this.last_pat - this.tot_break);
    req_anim_frame(this.ticker);
  };

  bpm.prototype['undo'] = function () {
    if (this.records.length <= 1) return;
    if (this.is_finished) return;
    this.breaking = false;
    this.last_pat = Date.now();
    this.last_pat_is_undo = true;
    this.last_undo_record = this.records[this.records.length - 1];
    this.records.pop();
    this.calc_estimation();
    req_anim_frame(this.ticker);
  };

  bpm.prototype['break'] = function () {
    if (this.records.length === 0) return;
    this.last_pat = this.breaking = Date.now();
    req_anim_frame(this.ticker);
  };

  bpm.prototype['finish'] = function () {
    if (this.records.length < 8) return;
    this.is_finished = true;
    this.last_pat = Date.now();
    this.calc_results();
    req_anim_frame(this.ticker);
  };

  window['bpm'] = function (id) { return new bpm(id); };
})(window);
