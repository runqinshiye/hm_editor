/**
 * 文档水印扩展
 * 支持文本水印与图片水印，可随分页对每页单独绘制
 */

// 纸张尺寸配置（mm），抽离为常量避免每次调用重复创建
var WATERMARK_PAPER_OPT_MM = {
    'A4_portrait': { width: 210, height: 297 },
    'A4_landscape': { width: 297, height: 210 },
    'A3_portrait': { width: 297, height: 420 },
    'A3_landscape': { width: 420, height: 297 },
    'A5_portrait': { width: 148, height: 210 },
    'A5_landscape': { width: 210, height: 148 },
    'B5_portrait': { width: 176, height: 250 },
    'B5_landscape': { width: 250, height: 176 }
};

commonHM.component['documentModel'].fn({
    /**
     * 设置文档水印（入口）
     * 根据是否分页：分页时对每个 .hm-logic-page 分别调用 watermark，否则对整页调用一次
     */
    setWatermark: function () {
        var _t = this;
        var _body = $(_t.editor.document.getBody().$);
        var realtimePageBreak = _t.editor.HMConfig.realtimePageBreak;
        var isLogicPage = _body.find('.hm-logic-page').length > 0;
        if (realtimePageBreak && isLogicPage) {
            // 分页：每页单独打水印
            _body.find('.hm-logic-page').each(function () {
                _t.watermark($(this));
            });
        } else {
            // 不分页：整页打水印
            _t.watermark(_body);
        }
    },

    /**
     * 在指定容器内绘制水印
     * @param {jQuery} $body 文档容器，不传则使用当前 document body
     */
    watermark: function ($body) {
        var _t = this;
        var settings = _t.editor.HMConfig.watermark;
        var _body = $body && $body.length ? $body : $(_t.editor.document.getBody().$);

        // 未配置水印类型时仅移除已有水印
        if (!settings || !settings.watermarkType) {
            _body.find('.mask_box').remove();
            return;
        }

        _body.css('position', 'relative');
        _body.find('.mask_box').remove();

        // 计算尺寸、行数列数、配置项
        var dims = _t._watermarkGetDimensions(_body, settings);
        var box = _t._watermarkCreateBox(dims.body_w_px, dims.body_h_px);
        var fragment = document.createDocumentFragment();
        var w = dims.opts.watermark_width, h = dims.opts.watermark_height;

        // 按行、列创建水印格子并放入 fragment
        for (var i = 0; i < dims.watermark_rows; i++) {
            for (var j = 0; j < dims.watermark_cols; j++) {
                var cell = _t._watermarkCreateCell(dims.opts, dims.rotateStr, dims.isImgWatermark, w * j, h * i, w, h, j);
                fragment.appendChild(cell);
            }
        }

        box.appendChild(fragment);
        _body.prepend(box);
    },

    /**
     * 计算水印所需尺寸与配置（宽高、行数列数、样式参数等）
     * 分页时根据 data-hm-paperSize 与纸张比例推算可视高度
     * @param {jQuery} _body 当前文档容器
     * @param {Object} settings 水印配置（来自 HMConfig.watermark）
     * @returns {Object} { body_w_px, body_h_px, watermark_rows, watermark_cols, opts, rotateStr, isImgWatermark }
     */
    _watermarkGetDimensions: function (_body, settings) {
        var _t = this;
        var paperSizeStr = _body.attr('data-hm-paperSize');
        var paperSize = paperSizeStr ? paperSizeStr.split('$') : null;
        var body_w_px = _body.outerWidth();
        var body_h_px = _body.outerHeight();

        // 分页模式下按纸张比例换算高度（逻辑页高度）
        if (_t.editor.HMConfig.realtimePageBreak && paperSize && WATERMARK_PAPER_OPT_MM[paperSize[0]]) {
            var opt = WATERMARK_PAPER_OPT_MM[paperSize[0]];
            body_h_px = body_w_px / opt.width * opt.height;
        }

        var rowHeight = Number(settings.watermarkHeight) || 50;
        var watermark_rows = Math.floor(body_h_px / rowHeight);
        // 列数：配置优先；未配置时文字水印默认 3 列，图片水印 1 列
        var watermark_cols = Number(settings.watermarkColumn) || (settings.watermarkType === 1 || settings.watermarkType === '1' ? 3 : 1);
        var isImgWatermark = settings.watermarkType === 2 || settings.watermarkType === '2';
        var angle = settings.watermarkAngle || 15;
        var rotateStr = 'rotate(' + angle + 'deg)';

        var opts = {
            watermark_img: settings.watermarkImg || '',
            watermark_angle: angle,
            watermark_alpha: settings.watermarkAlpha || 0.3,
            watermark_width: body_w_px / watermark_cols,
            watermark_height: rowHeight,
            watermark_txt: isImgWatermark ? '' : (settings.watermarkText || ''),
            watermark_color: settings.watermarkFontColor || '#000000',
            watermark_fontsize: (settings.watermarkFontSize == null ? 14 : settings.watermarkFontSize) + 'px'
        };

        return { body_w_px: body_w_px, body_h_px: body_h_px, watermark_rows: watermark_rows, watermark_cols: watermark_cols, opts: opts, rotateStr: rotateStr, isImgWatermark: isImgWatermark };
    },

    /**
     * 创建水印外层容器 .mask_box，铺满目标区域
     * @param {number} body_w_px 容器宽度（px）
     * @param {number} body_h_px 容器高度（px）
     * @returns {HTMLElement}
     */
    _watermarkCreateBox: function (body_w_px, body_h_px) {
        var box = document.createElement('div');
        box.className = 'mask_box';
        box.setAttribute('contenteditable', 'false');
        box.style.position = 'absolute';
        box.style.top = '0';
        box.style.left = '0';
        box.style.width = body_w_px + 'px';
        box.style.height = body_h_px + 'px';
        box.style.overflow = 'hidden';
        return box;
    },

    /**
     * 创建单个水印格子 .mask_div（文本或图片，带旋转与透明度）
     * @param {Object} opts 水印配置（含文案、图片、透明度、字体等）
     * @param {string} rotateStr CSS 旋转值，如 'rotate(15deg)'
     * @param {boolean} isImgWatermark 是否为图片水印
     * @param {number} x 格子左上角 left（px）
     * @param {number} y 格子左上角 top（px）
     * @param {number} w 格子宽度（px）
     * @param {number} h 格子高度（px）
     * @param {number} colIndex 列索引，奇数列会设置 lineHeight 以配合文字居中
     * @returns {HTMLElement}
     */
    _watermarkCreateCell: function (opts, rotateStr, isImgWatermark, x, y, w, h, colIndex) {
        var mask_div = document.createElement('div');
        mask_div.className = 'mask_div';
        mask_div.setAttribute('contenteditable', 'false');
        mask_div.innerHTML = opts.watermark_txt;

        // 旋转：多前缀兼容
        mask_div.style['-webkit-transform'] = rotateStr;
        mask_div.style['-moz-transform'] = rotateStr;
        mask_div.style['-os-transform'] = rotateStr;
        mask_div.style.transform = rotateStr;
        mask_div.style['-ms-transform'] = rotateStr;
        mask_div.style['-ms-filter'] = 'progid:DXImageTransform.Microsoft.BasicImage(rotation=2)';
        mask_div.style.visibility = '';
        // 定位与尺寸
        mask_div.style.position = 'absolute';
        mask_div.style.left = x + 'px';
        mask_div.style.top = y + 'px';
        mask_div.style.overflow = 'hidden';
        mask_div.style.pointerEvents = 'none';  // 不阻挡下方编辑区点击
        mask_div.style.opacity = opts.watermark_alpha;
        mask_div.style.fontSize = opts.watermark_fontsize;
        mask_div.style.color = opts.watermark_color;
        mask_div.style.textAlign = 'center';
        mask_div.style.width = w + 'px';
        mask_div.style.height = h + 'px';
        mask_div.style.display = 'block';
        if (colIndex % 2 !== 0) {
            mask_div.style['line-height'] = h + 'px';
        }

        // 图片水印：在格子内插入占满的 img
        if (isImgWatermark) {
            var mask_img = document.createElement('img');
            mask_img.className = 'mask_img';
            mask_img.src = opts.watermark_img;
            mask_img.style.width = '100%';
            mask_img.style.height = '100%';
            mask_div.appendChild(mask_img);
        }

        return mask_div;
    }
});
