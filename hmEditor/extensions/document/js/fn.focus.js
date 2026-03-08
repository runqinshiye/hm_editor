commonHM.component['documentModel'].fn({
    /**
     * 定位到病历或元素
     * @param {String} docCode 病历ID（必填）
     * @param {String} eleCode 元素ID（可选）
     * @param {String} eleContent 元素内容或 trace_id（可选）。传文本时按内容定位光标；传 trace_id 时按 [trace_id="xxx"] 定位到对应节点
     * @returns {Boolean} 是否成功定位
     * 
     * 使用说明：
     * 1. 只有病历ID：滚动条定位到病历
     * 2. 病历+元素：滚动条定位到元素，如果是文本则光标定位到元素内容的开头
     * 3. 病历+元素+eleContent：若 eleContent 为 trace_id 则定位到该 trace 节点，否则按文本内容定位光标
     * 4. 病历+eleContent（无 eleCode）：若 eleContent 为 trace_id 则在病历内查找该节点并定位
     */
    focusDocElement: function (docCode, eleCode, eleContent) {
        var _t = this;

        // 校验 docCode 是否传入
        if (!docCode) {
            console.error('focusElement: 病历ID不能为空');
            return false;
        }

        try {
            // 获取编辑器实例
            var editor = _t.editor;
            if (!editor) {
                console.error('focusElement: 编辑器实例未初始化');
                return false;
            }

            // 获取编辑器 body 节点（jQuery 包装）
            var editorBody = editor.document.getBody();
            var $body = $(editorBody.$);

            // 查找病历（通过 doc_code 属性，理论上病历只有一个节点）
            var $docWidget = $body.find('[doc_code="' + docCode + '"]');

            // 如果未找到病历节点，直接返回
            if ($docWidget.length === 0) {
                console.warn('focusElement: 未找到病历，docCode=' + docCode);
                return false;
            }

            // 情况1：只有病历ID，且无 eleCode/eleContent，滚动到病历节点
            if (!eleCode && !eleContent) {
                var docElement = $docWidget[0];
                _t._scrollToElement(docElement);
                return true;
            }

            // 如果有 eleContent，优先判断是否为 trace_id 定位
            if (eleContent) {
                // 默认在整个病历范围查找
                var searchScope = $docWidget;
                // 如传递 eleCode，进一步缩小范围
                if (eleCode) {
                    // 优先使用 data-hm-code 查找
                    var $byCode = $docWidget.find('[data-hm-code="' + eleCode + '"]:not([data-hm-node="labelbox"])');
                    // 如果 data-hm-code 没找到，用 data-hm-name
                    if ($byCode.length === 0) {
                        $byCode = $docWidget.find('[data-hm-name="' + eleCode + '"]:not([data-hm-node="labelbox"])');
                    }
                    // 若找到目标元素，缩小 trace_id 查询范围
                    if ($byCode.length > 0) {
                        searchScope = $byCode.first();
                    }
                }
                // 以 trace_id 查找节点
                var $byTraceId = searchScope.find('[trace_id="' + eleContent + '"]').first();
                if ($byTraceId.length > 0) {
                    // 若有 trace_id 匹配节点，则直接定位到节点并设置光标
                    var traceEl = $byTraceId[0];
                    var traceCk = new CKEDITOR.dom.element(traceEl);
                    _t._focusWithCursor(editor, traceCk, null, traceCk);
                    return true;
                }
            }

            // 无 eleCode 且 eleContent 按 trace_id 也未找到，直接返回（无法按文本内容精准定位）
            if (!eleCode) {
                if (eleContent) {
                    console.warn('focusElement: 未找到 trace_id 对应节点，docCode=' + docCode + ', eleContent=' + eleContent);
                }
                return false;
            }

            // 以下处理 eleCode 场景（情况2和3）：按 eleCode 查找目标元素
            // 优先按 data-hm-code 查找，排除掉 labelbox 类型
            var $element = $docWidget.find('[data-hm-code="' + eleCode + '"]:not([data-hm-node="labelbox"])');
            // 找不到时用 data-hm-name
            if ($element.length === 0) {
                $element = $docWidget.find('[data-hm-name="' + eleCode + '"]:not([data-hm-node="labelbox"])');
            }
            // 若目标元素仍未找到，返回
            if ($element.length === 0) {
                console.warn('focusElement: 未找到元素，docCode=' + docCode + ', eleCode=' + eleCode);
                return false;
            }

            // 取第一个匹配到的元素，以后续定位和光标操作
            var targetElement = $element.first()[0];
            var ckElement = new CKEDITOR.dom.element(targetElement);
            // 获取元素类型
            var nodeType = $element.attr('data-hm-node');
            // 获取适合光标定位的目标元素
            var cursorTarget = _t._getCursorTargetElement(ckElement, nodeType);

            // 情况3：eleContent 作为文本时，在指定元素内查找文本并定位光标
            if (eleContent) {
                var cursorInfo = _t._findTextPosition(editor, cursorTarget, eleContent);
                _t._focusWithCursor(editor, cursorTarget, cursorInfo, ckElement);
                return true;
            }

            // 情况2：只有元素（无内容定位）
            if (nodeType == 'newtextbox') {
                // 可编辑文本框，直接将光标定位到起始处
                _t._focusWithCursor(editor, cursorTarget, null, ckElement);
            } else {
                // 非可编辑文本框仅滚动视图
                _t._scrollToElement(ckElement);
            }

            return true;
        } catch (error) {
            // 发生任何异常，输出错误日志并返回 false
            console.error('focusElement: 执行失败', error);
            return false;
        }
    },
    
    /**
     * 获取光标目标元素（内部方法）
     * @param {CKEDITOR.dom.element} ckElement CKEditor元素
     * @param {String} nodeType 节点类型
     * @returns {CKEDITOR.dom.element} 光标目标元素
     */
    _getCursorTargetElement: function (ckElement, nodeType) {
        // 文本控件（newtextbox）的可编辑区域在内部 .new-textbox-content，需定位到该子元素才能正确落光标
        if (nodeType == 'newtextbox') {
            var $element = $(ckElement.$);
            var $contentElement = $element.find('.new-textbox-content').first();
            if ($contentElement.length > 0) {
                return new CKEDITOR.dom.element($contentElement[0]);
            }
        }
        // 非 newtextbox 或未找到子内容时，直接使用当前元素
        return ckElement;
    },
    
    /**
     * 滚动到元素位置并添加高亮效果（内部方法）
     * @param {HTMLElement|CKEDITOR.dom.element} element DOM元素或CKEditor元素
     * @param {Boolean} highlight 是否添加高亮效果，默认true
     */
    _scrollToElement: function (element, highlight) {
        var _t = this;
        
        // 兼容 CKEditor 元素和原生 DOM 元素
        var domElement = element.$ || element;
        var ckElement = element.$ ? element : new CKEDITOR.dom.element(element);
        
        // 滚动到元素位置
        if (domElement && domElement.scrollIntoView) {
            domElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
                inline: 'nearest'
            });
        }
        
        // 添加高亮效果（默认添加）
        if (highlight !== false) {
            _t._addHighlightEffect(ckElement);
        }
    },
    
    /**
     * 添加高亮效果（内部方法）
     * @param {CKEDITOR.dom.element} ckElement CKEditor元素
     */
    _addHighlightEffect: function (ckElement) {
        var _t = this;
        
        // 移除之前的高亮效果
        _t._removeHighlightEffect();
        
        // 添加高亮样式类（与文档树使用相同的样式类）
        ckElement.addClass('cke_node_highlight');
        
        // 记录当前高亮的元素，方便后续清除
        _t._highlightElement = ckElement;
        
        // 3秒后自动移除高亮效果
        _t._highlightTimer = setTimeout(function() {
            _t._removeHighlightEffect();
        }, 3000);
    },
    
    /**
     * 移除高亮效果（内部方法）
     */
    _removeHighlightEffect: function () {
        var _t = this;
        
        // 清除定时器
        if (_t._highlightTimer) {
            clearTimeout(_t._highlightTimer);
            _t._highlightTimer = null;
        }
        
        // 移除高亮样式
        if (_t._highlightElement) {
            _t._highlightElement.removeClass('cke_node_highlight');
            _t._highlightElement = null;
        }
    },
    
    /**
     * 设置光标到元素（内部方法）
     * @param {CKEDITOR.editor} editor 编辑器实例
     * @param {CKEDITOR.dom.element} targetElement 目标元素
     * @param {Object} cursorInfo 光标位置信息（可选，null表示定位到元素开头）
     */
    _setCursor: function (editor, targetElement, cursorInfo) {
        try {
            var range = editor.createRange();
            
            if (cursorInfo && cursorInfo.node) {
                // 定位到指定文本位置
                range.setStart(cursorInfo.node, cursorInfo.offset);
            } else {
                // 定位到元素开头
                if (!range.moveToElementEditStart(targetElement)) {
                    range.moveToPosition(targetElement, CKEDITOR.POSITION_AFTER_START);
                }
            }
            
            range.collapse(true);
            
            var selection = editor.getSelection();
            selection.removeAllRanges();
            selection.selectRanges([range]);
        } catch (e) {
            console.warn('_setCursor: 设置光标失败', e);
        }
    },
    
    /**
     * 聚焦并设置光标（内部方法）
     * 参考文档树的实现：先focus，再scrollIntoView，最后添加高亮
     * @param {CKEDITOR.editor} editor 编辑器实例
     * @param {CKEDITOR.dom.element} cursorTarget 光标目标元素
     * @param {Object} cursorInfo 光标位置信息（可选）
     * @param {CKEDITOR.dom.element} highlightTarget 高亮目标元素
     */
    _focusWithCursor: function (editor, cursorTarget, cursorInfo, highlightTarget) {
        var _t = this;
        
        // 1. 聚焦编辑器
        editor.focus();
        
        // 2. 滚动到目标位置并添加高亮
        _t._scrollToElement(highlightTarget);
        
        // 3. focus 后设置光标位置
        setTimeout(function() {
            _t._setCursor(editor, cursorTarget, cursorInfo);
        }, 10);
    },
    
    /**
     * 在元素中查找文本位置（内部方法）
     * @param {CKEDITOR.editor} editor 编辑器实例
     * @param {CKEDITOR.dom.element} element 目标元素
     * @param {String} text 要查找的文本
     * @returns {Object|null} 光标位置信息 {node, offset}，未找到返回 null
     */
    _findTextPosition: function (editor, element, text) {
        if (!text || !element) {
            return null;
        }
        
        try {
            // 获取元素的文本内容
            var elementText = element.getText();
            if (!elementText) {
                return null;
            }
            
            // 查找文本在元素中的位置
            var textIndex = elementText.indexOf(text);
            if (textIndex === -1) {
                // 如果直接查找不到，尝试去除空白字符后查找
                var normalizedText = text.replace(/\s+/g, ' ').trim();
                var normalizedElementText = elementText.replace(/\s+/g, ' ');
                textIndex = normalizedElementText.indexOf(normalizedText);
                
                if (textIndex === -1) {
                    return null;
                }
            }
            
            // 使用 walker 遍历文本节点来精确定位
            var selrange = editor.createRange();
            selrange.selectNodeContents(element);
            
            var walker = new CKEDITOR.dom.walker(selrange);
            walker.evaluator = function (node) {
                return node.type === CKEDITOR.NODE_TEXT;
            };
            
            var node;
            var currentOffset = 0;
            
            while ((node = walker.next())) {
                var nodeText = node.getText();
                var nodeLength = nodeText.length;
                
                // 检查目标文本是否在当前节点中
                if (currentOffset <= textIndex && textIndex < currentOffset + nodeLength) {
                    return {
                        node: node,
                        offset: textIndex - currentOffset
                    };
                }
                
                currentOffset += nodeLength;
            }
            
            return null;
        } catch (error) {
            console.warn('_findTextPosition: 查找文本位置失败', error);
            return null;
        }
    }
});
