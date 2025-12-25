commonHM.component['documentModel'].fn({
    /**
     * 设置文档只读
     * @param {*} code  文档唯一编号
     * @param {*} flag  true:只读 false:可编辑
     */
    setReadOnly: function (code, flag) {
        var _t = this;
        var widgetList = [];
        var $body = $(_t.editor.document.getBody().$);
        if (code) { // 如果存在code，则获取指定文档内容
            widgetList = $body.find('[data-hm-widgetid="' + code + '"]');
        } else {
            // 获取所有文档内容
            widgetList = $body.find('[data-hm-widgetid]');
        }
        if (widgetList.length) {
            for (var i = 0; i < widgetList.length; i++) {
                var $widgetNodes = $(widgetList[i]);
                // 在病历壳子上标记当前只读状态 用于分页状态下判断是否需要设置页眉页脚只读
                $widgetNodes.attr('_readonly', flag ? 'true' : 'false');
                // 设置是否可编辑
                $widgetNodes.prop("contenteditable", !flag);
                if ($widgetNodes.attr("_contenteditable")=='false') {
                    $widgetNodes.prop("contenteditable", false);
                }
                // 设置背景颜色
                _t.setReadOnlyBgColor($widgetNodes, flag);
                // 设置简洁模式
                _t.switchCssConciseModel($widgetNodes, flag);
                // 设置编辑状态（下拉框、时间组件等）
                _t.setEmrDocumentEditState($widgetNodes, flag);
                // 设置新文本框可编辑
                _t.setEmrNewTextBoxEditable($widgetNodes, flag); 
            }
        } else {
            alert('没有找到有效的文档内容');
        }
        if (flag) {
            $body.find('.cke_widget_wrapper .cke_image_resizer').addClass('cke_image_resizer_hide');
        } else {
            $body.find('.cke_widget_wrapper .cke_image_resizer').removeClass('cke_image_resizer_hide');
        }
        // 分页情况下，根据当前页第一份病历的只读状态设置页眉页脚的只读状态
        _t.setPageHeaderFooterReadOnly($body);
    },
    /**
     * 分页情况下，根据当前页第一份病历的只读状态设置页眉页脚的只读状态
     * @param {jQuery} $body 编辑器body元素
     */
    setPageHeaderFooterReadOnly: function ($body) {
        var _t = this;
        var $logicPages = $body.find('.hm-logic-page');
        if ($logicPages.length > 0) {
            $logicPages.each(function() {
                var $logicPage = $(this);
                // 找到当前页的第一份病历（在hm-page-content中查找）
                var $pageContent = $logicPage.find('.hm-page-content');
                var $firstWidget = $pageContent.find('[data-hm-widgetid]').first();
                if ($firstWidget.length > 0) {
                    // 获取第一份病历的只读状态
                    var firstWidgetReadonly = $firstWidget.attr('_readonly');
                    var isReadonly = firstWidgetReadonly === 'true';
                    
                    // 设置当前页页眉页脚的只读状态（在逻辑页范围内查找）
                    var $pageHeaders = $logicPage.find('.hm-page-header-group table[_paperheader="true"]');
                    var $pageFooters = $logicPage.find('.hm-page-footer-group table[_paperfooter="true"]');
                    
                    // 设置页眉只读状态
                    $pageHeaders.each(function() {
                        var $header = $(this);
                        $header.prop("contenteditable", !isReadonly);
                        // 设置简洁模式
                        _t.switchCssConciseModel($header, isReadonly);
                        _t.setEmrDocumentEditState($header, isReadonly);
                        _t.setEmrNewTextBoxEditable($header, isReadonly);
                    });
                    
                    // 设置页脚只读状态
                    $pageFooters.each(function() {
                        var $footer = $(this);
                        $footer.prop("contenteditable", !isReadonly);
                        // 设置简洁模式
                        _t.switchCssConciseModel($footer, isReadonly);
                        _t.setEmrDocumentEditState($footer, isReadonly);
                        _t.setEmrNewTextBoxEditable($footer, isReadonly);
                    });
                }
            });
        }
    },
    // 设置背景颜色
    setReadOnlyBgColor: function ($widgetNodes, flag) {
        if (flag) {
            // 分页状态下设置背景颜色
            if ($widgetNodes.find('.hm-page-content').length) {
                $widgetNodes.find('.hm-page-content').children().addClass('hm-readonly-bgcolor');
            } else {
                $widgetNodes.children().addClass('hm-readonly-bgcolor');
            }
        } else {
            // 非分页状态下取消背景颜色
            if ($widgetNodes.find('.hm-page-content').length) {
                $widgetNodes.find('.hm-page-content').children().removeClass('hm-readonly-bgcolor');
            } else {
                $widgetNodes.children().removeClass('hm-readonly-bgcolor');
            }
        }
    },
    // 设置简洁模式
    switchCssConciseModel: function ($widgetNodes, flag) {
        if (flag) {
            var features = '._printHide,._paragraphHide,.hide_class,' +
                '.new-textbox,[data-hm-node],[_placeholderText],ins,.cke_page_split_mark,.continuation-identifier';
            $widgetNodes.find(features).addClass('concise-model');
        } else {
            $widgetNodes.find('.concise-model').removeClass('concise-model');
        }
    },
    // 设置编辑状态
    setEmrDocumentEditState: function ($widgetNodes, flag) {
        var evtState = flag ? 'none' : 'auto';
        $widgetNodes.find('span[data-hm-node="timebox"]:not([_isdisabled="true"])').css('pointer-events', evtState);
        $widgetNodes.find('span[data-hm-node="dropbox"]:not([_isdisabled="true"])').css('pointer-events', evtState);
        $widgetNodes.find('span[data-hm-node="checkbox"]:not([_isdisabled="true"])').css('pointer-events', evtState);
        $widgetNodes.find('span[data-hm-node="radiobox"]:not([_isdisabled="true"])').css('pointer-events', evtState);
        $widgetNodes.find('span[data-hm-node="searchbox"]:not([_isdisabled="true"])').css('pointer-events', evtState);
        $widgetNodes.find('span[data-hm-node="newtextbox"]:not([_isdisabled="true"])').css('pointer-events', evtState);
        $widgetNodes.find('button[data-hm-id]').css('pointer-events', evtState);
    },
    // 设置新文本框可编辑
    setEmrNewTextBoxEditable: function ($widgetNodes, flag) {
        var editStr = flag ? 'false' : 'true';
        var _newTextBox = $widgetNodes.find('span[data-hm-node="newtextbox"]:not([_isdisabled="true"]):not([notallowwrite="true"])');
        var _textboxwidget = $widgetNodes.find('span[data-hm-node="textboxwidget"]');
        var _addMarkList = $widgetNodes.find('ins[class*="hm"]');
        if (_newTextBox.length > 0) {
            _newTextBox.find(".new-textbox-content").attr("contenteditable", editStr);
            //嵌套数据元会把内部所有外层新文本设置为可编辑导致聚焦，placeholder等都有问题
            //处理新数据元内部元素(span(除医学表达式外),font)contenteditable与外层不一致的情况
            var spans = _newTextBox.find(".new-textbox-content").find('span:not([data-hm-node="expressionbox"])');
            var fonts = _newTextBox.find(".new-textbox-content").find('font');
            if (spans.length > 0) {
                spans.attr("contenteditable", editStr);
            }
            if (fonts.length > 0) {
                fonts.attr("contenteditable", editStr);
            }
            //处理历史嵌套数据元外层contenteditable已被设置ture的病历
            var otherDatasource = _newTextBox.find('span[data-hm-node="newtextbox"]:not([contenteditable="false"])');
            otherDatasource.attr("contenteditable", false);
        }
        if (_addMarkList.length > 0) {
            _addMarkList.attr("contenteditable", editStr);
        }
        if (_textboxwidget.length > 0) {
            _textboxwidget.attr("contenteditable", editStr);
        }
    },
    /**
     * 设置数据元只读
     * @param {String} code 文档唯一编号
     * @param {Array} elementList 数据元code数组集合
     * @param {Boolean} flag  true:只读 false:可编辑
     */
    setElementReadOnly: function (code, elementList, flag) {
        var _t = this;
        var $body = $(_t.editor.document.getBody().$);
        var $widgetNodes = null;

        // 参数校验
        if (!Array.isArray(elementList) || elementList.length === 0) {
            console.warn('elementList 参数无效，必须是包含数据元code的数组');
            return;
        }

        // 根据code获取指定文档
        if (code) {
            $widgetNodes = $body.find('[data-hm-widgetid="' + code + '"]');
        } else {
            // 如果没有传入code，则对所有文档进行处理
            $widgetNodes = $body.find('[data-hm-widgetid]');
        }

        if (!$widgetNodes || $widgetNodes.length === 0) {
            console.warn('没有找到有效的文档内容');
            return;
        }

        // 遍历所有文档widget
        for (var i = 0; i < $widgetNodes.length; i++) {
            var $widget = $($widgetNodes[i]);

            // 遍历 elementList 中的每个数据元 code
            for (var j = 0; j < elementList.length; j++) {
                var elementCode = elementList[j];

                // 在文档中查找对应的数据元节点（通过data-hm-code属性，排除labelbox）
                var $elements = $widget.find('[data-hm-code="' + elementCode + '"]:not([data-hm-node="labelbox"])');

                // 如果找到了数据元节点，设置其只读状态
                if ($elements.length > 0) {
                    $elements.each(function () {
                        var $element = $(this);
                        _t.setElementReadOnlyState($element, flag);
                    });
                }
            }
        }
    },
    /**
     * 设置单个数据元元素的只读状态
     * @param {jQuery} $element 数据元元素
     * @param {Boolean} flag true:只读 false:可编辑
     */
    setElementReadOnlyState: function ($element, flag) {
        var _t = this;
        var nodeType = $element.attr('data-hm-node');
        var evtState = flag ? 'none' : 'auto'; // pointer-events
        var editStr = flag ? 'false' : 'true'; // contenteditable

        // 如果是被禁用的元素，跳过处理
        if ($element.attr('_isdisabled') === 'true') {
            return;
        }
        // 设置简洁模式
        if (flag) {
             var features = '._printHide,._paragraphHide,.hide_class,' +
                '.new-textbox,[data-hm-node],[_placeholderText],ins,.cke_page_split_mark,.continuation-identifier';
            $element.addClass('concise-model');
            $element.find(features).addClass('concise-model'); 
        } else {
            $element.removeClass('concise-model');
            $element.find('.concise-model').removeClass('concise-model');
        }
        // 根据不同的节点类型设置只读状态
        switch (nodeType) {
            case 'timebox':
            case 'dropbox':
            case 'checkbox':
            case 'radiobox':
            case 'searchbox':
                // 设置pointer-events来控制交互
                $element.css('pointer-events', evtState);
                break;
            case 'newtextbox':
                // 新文本框需要特殊处理
                $element.css('pointer-events', evtState);
                var $content = $element.find(".new-textbox-content");
                if ($content.length > 0) {
                    $content.attr("contenteditable", editStr);
                    // 处理内部元素
                    var spans = $content.find('span:not([data-hm-node="expressionbox"])');
                    var fonts = $content.find('font');
                    if (spans.length > 0) {
                        spans.attr("contenteditable", editStr);
                    }
                    if (fonts.length > 0) {
                        fonts.attr("contenteditable", editStr);
                    }
                }
                break;
            case 'textboxwidget':
                // 文本框组件
                $element.attr("contenteditable", editStr);
                break;
            case 'cellbox':
                // 表格单元格
                $element.attr("contenteditable", editStr);
                break;
            case 'expressionbox':
                // 医学表达式框
                $element.css('pointer-events', evtState);
                break;
            default:
                // 其他类型的数据元，通用处理
                if ($element.attr('contenteditable') !== undefined) {
                    $element.attr("contenteditable", editStr);
                } else {
                    $element.css('pointer-events', evtState);
                }
                break;
        }
    }
});