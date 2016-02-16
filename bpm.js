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

  var rgb_interpolate = function (r1, g1, b1, r2, g2, b2, x) {
    if (x <= 0) return 'rgb(' + r1.toString() + ',' + g1.toString() + ',' + b1.toString() + ')';
    else if (x >= 1) return 'rgb(' + r2.toString() + ',' + g2.toString() + ',' + b2.toString() + ')';
    return 'rgb(' + Math.round(r1 + (r2 - r1) * x).toString() + ',' +
      Math.round(g1 + (g2 - g1) * x).toString() + ',' +
      Math.round(b1 + (b2 - b1) * x).toString() + ')';
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
    var estimation_str = '---';
    this.drawctx.textBaseline = 'top';
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
    text_size = this.drawctx.measureText(estimation_str);
    this.drawctx.fillText(estimation_str, w - text_size.width - 6, h * 0.5);
    if (this.is_finished) {
      if (dt < 2000) window.requestAnimationFrame(this.ticker);
    } else {
      // One step further
      if (dt < 200) window.requestAnimationFrame(this.ticker);
    }
  };

  bpm.pat = function () {
    if (this.is_finished) return;
    this.last_pat = Date.now();
    this.records.push(this.last_pat);
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
    ret.records = [];
    ret.is_finished = false;
    // Methods
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
