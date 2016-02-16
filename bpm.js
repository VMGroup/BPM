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

  bpm.refresh_display = function () {
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.drawctx.fillStyle = '#ffffcc';
    this.drawctx.fillRect(0, 0, w, h);
    var history_ct = Math.ceil(w / 160) + 2;
    for (var i = 0; i < history_ct; ++i) {
      this.drawctx.beginPath();
      this.drawctx.arc(
        w - i * 160 + 80 + Math.max(0, Math.pow(1 - (Date.now() - this.last_pat) / 200, 3)) * 160 + 10,
        h / 2, 10, 0, 2 * Math.PI);
      this.drawctx.fillStyle = '#bbbb88';
      this.drawctx.fill();
    }
    window.requestAnimationFrame(this.ticker);
  };

  bpm.pat = function () {
    this.last_pat = Date.now();
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
    // Methods
    ret.refresh_display = bpm.refresh_display;
    ret.pat = bpm.pat;
    // Timers
    ret.ticker = (function (_ret) { return function () { _ret.refresh_display(); }; })(ret);
    window.requestAnimationFrame(ret.ticker);
    return ret;
  };

  window.bpm = bpm;
})(window);
