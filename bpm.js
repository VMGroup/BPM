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

  bpm.calc_estimation = function (dt) {
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
        var e2 = 60000.0 / ((this.records[this.records.length - 1] - this.records[this.records.length - 9]) / 9);
        var estimation = (e1 + e2) / 2;
        estimation_str = Math.round(estimation).toString();
      }
    }
    while (estimation_str.length < 3) estimation_str = ' ' + estimation_str;
    this.last_eststr = this.cur_eststr;
    this.cur_eststr = estimation_str;
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
      this.drawctx.fillStyle = rgb_interpolate(0x99, 0x99, 0x55, 0xff, 0xff, 0xff, dt / 100);
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
      if (dt < 200 && this.cur_eststr[i] !== this.last_eststr[i]) {
        this.drawctx.fillStyle = 'rgba(135, 135, 85, ' + (1 - dt / 200).toString() + ')';
        this.drawctx.fillText(this.last_eststr[i], w - text_size.width * (3 - i) - 6, h * 0.5 + 20 * ease_cubic_in(dt / 200));
        this.drawctx.fillStyle = 'rgba(135, 135, 85, ' + (dt / 200).toString() + ')';
        this.drawctx.fillText(this.cur_eststr[i], w - text_size.width * (3 - i) - 6, h * 0.5 - 20 * (1 - ease_cubic_out(dt / 200)));
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
      this._p_x = [];
      this._p_y = [];
      for (var i = 0; i < this.records.length; ++i) {
        this._p_x[i] = 4 + (w - 8) * i / (this.records.length - 1);
        this._p_y[i] = h - 4 - (h - 8) * (this.records[i] - this.records[0]) / (this.records[this.records.length - 1] - this.records[0]);
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
    this.records.push(this.last_pat);
    this.calc_estimation();
    window.requestAnimationFrame(this.ticker);
  };

  bpm.finish = function () {
    this.is_finished = true;
    this.last_pat = Date.now();
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
    ret.records = [];
    ret.is_finished = false;
    // Methods
    ret.calc_estimation = bpm.calc_estimation;
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
