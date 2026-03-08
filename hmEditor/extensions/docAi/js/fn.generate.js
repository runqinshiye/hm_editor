/**
 * 文档生成  mayson 大模型文档结点内容生成
 */
commonHM.component['hmAi'].fnSub("generator", {
    init:function(){
        var _t = this;
        _t.Url = _t.parent.Url;
        _t.converter = new showdown.Converter({
            tables: true,
            tasklists: true,
            strikethrough: true,
            ghCodeBlocks: true,
            smartIndentationFix: true,
            parseImgDimensions: true,
            simplifiedAutoLink: true,
            literalMidWordUnderscores: true,
            emoji: true
          });
        _t.winHeight = $('body').height();
        
        // 初始化批量处理相关属性
        _t.batchQueue = [];
        _t.batchProcessedCount = 0;
        _t.batchTotalCount = 0;
        _t.batchProcessing = false;
        $(window).resize(function () {
            _t.setPosition();
        });
    },
    /**
     * 调用提醒端 API 生成内容（可能多次回调：flag=1 进行中，2 成功，3 失败，4 中断，5 不支持）
     * @param {*} traget - 目标 DOM 节点（输入框容器）
     * @param {*} type - 生成类型
     * @param {*} from - 来源，如 'generateDocument' 表示批量生成
     */
    generateMessage: function (traget,type,from) {
        var _t = this;
        var JTar = $(traget);
        var editorTool = _t.parent.editorTool,
            utils = _t.parent.utils;
        if(editorTool && editorTool.callCommand('isOpen')){
            return;
        }
        // 已有未处理的生成结果时不再发起新请求
        if(JTar.find('.r-model-gen').length){
            return;
        }
        // 非批量时：若有进行中的任务则不再发起
        if(from != 'generateDocument' && (_t.progressFlag==1 || _t.parent.hasTask)){
            return;
        }
        _t.target = traget;
        _t.fillIndex = 0; // 打字效果回填索引，每次生成重置
        var content = utils.getContent(JTar);
        var uuId = utils.getUUId(); 
        var position = utils.getPosition(JTar.closest('p')[0]);
        var keyTar = JTar.closest('span[data-hm-code]');
        editorTool.callCommand('openGenRecord',{
            position:position,
            data:{
                nodeName: keyTar.attr('data-hm-name'),
                nodeCode:keyTar.attr('data-hm-code'),
                content:content
            },
            type:type
        }, function (message, flag) {
            if(flag!=1){
                console.log('flag------------------------------:',flag);
            }
            if(flag!=5){
                _t.popupProgress(JTar);
                // 回填并播放打字效果；回调在「本轮打字结束」时执行（此时轮询可能尚未结束）
                _t.fillText(message,JTar,uuId,function(){
                    // 仅当轮询结束(flag!=1)时：显示「AI内容，请确认」按钮并更新弹框/批量逻辑
                    if(flag!=1){
                        // 显示「AI内容，请确认」按钮
                        JTar.find('.r-model-gen-btn').removeClass('r-model-gen-btn-hidden');
                        // 更新进度弹框状态（flag===4 且非批量时提示中断）
                        _t.manageProgress(2, flag===4 && from!=='generateDocument');
                        // 批量生成场景：当前节点结束后处理结果并驱动下一节点
                        if(from=='generateDocument'){
                            _t.batchProcessing = false;
                            if (flag==2) {
                                // 生成成功：自动采纳 AI 结果写入文档
                                _t.accpetAiResult(JTar,'r-model-gen','generateDocument');
                            }else if(flag==3 || flag==4){
                                // 失败或中断：弃用当前草稿
                                _t.ignoreAiResult(JTar,'r-model-gen');
                            }
                            _t.closePopup();
                            if(_t.batchQueue && _t.batchQueue.length > 0) {
                                _t.processNextBatchNode();
                            }
                        }
                       
                    }
                });
            } else {
                // flag===5：该节点不支持，批量时继续下一个
                if(from=='generateDocument' && _t.batchQueue && _t.batchQueue.length > 0) {
                    _t.processNextBatchNode();
                }
            }
           
        });
        //直接生成
        // if(type==2){
        //     _t.popupProgress(JTar);
        // }
        //  var message = '切除术前行胸部CT检查示左肺上叶尖后段见不规则结节影，周围见毛刺，内部见小空腔影，大小约为18*17mm。诊断为左肺上叶尖后段结节，肿瘤性病变不能除外。之后入住胸外科，并于2020.07.23行胸腔镜左肺上叶切除术，术顺，术后予以抗炎、化痰等治疗。';
        //  _t.popupProgress(JTar);
        // _t.fillText(message,JTar,uuId,function(){
        //     _t.manageProgress(2);
        // });
    },
    /**
     * 重置弹框位置（Composer 等外部定位）
     */
    setPosition:function(){
        var _t = this;
        var editorTool = _t.parent.editorTool,
            utils = _t.parent.utils;
        if(editorTool && editorTool.callCommand('isOpen')){
            var position = utils.getPosition($(_t.target).closest('p')[0]); 
            editorTool.callCommand('setPosition',position);
        }
    },

    /**
     * 回填内容：将 message 以打字机效果逐字写入编辑区，结束后执行回调
     * 每次有新内容回填时会先隐藏「AI内容，请确认」按钮，避免轮询未结束时误展示
     * @param {string} message - 待回填的全文（可能随轮询多次增长）
     * @param {jQuery} JTar - 目标输入框容器
     * @param {string} uuid - 本次生成唯一标识
     * @param {Function} cbk - 打字效果结束后的回调（由调用方根据 flag 决定是否显示按钮等）
     */
    fillText: function (message,JTar,uuid,cbk) {
        var _t = this;
        if (message) {
            JTar.find('.r-model-gen-remark').remove();
            // 每次开始回填都先隐藏按钮，避免中途轮询返回新内容前按钮已露出
            JTar.find('.r-model-gen-btn').addClass('r-model-gen-btn-hidden');
            if (_t.fillInervalId) {
                clearInterval(_t.fillInervalId);
                _t.fillInervalId = null;
            }
            _t.fillInervalId = setInterval(function () {
                if (message && _t.fillIndex <= message.length) {
                    var currMessage = message.slice(0, _t.fillIndex++);
                    var html = _t.converter.makeHtml(currMessage);
                    var jDom = $('<div>').html(html);
                    var currText = jDom.text().replace(/\n+/g,'\n');
                    if(currText.length%10==0 && _t.popup){
                        _t.popup.setPostion(2,-80);
                    }
                    _t.insertAiResult(JTar,{className:'r-model-gen',text:currText,uuid:uuid});
                } else {
                    if (_t.fillInervalId) {
                        clearInterval(_t.fillInervalId);
                        _t.fillInervalId = null;
                    }
                    if (_t.popup) {
                        _t.popup.setPostion(2,-80);
                    }
                    cbk && cbk();
                }
            }, 30);
        } else {
            cbk && cbk();
        }
    },
    /** 滚动文档使 Composer 区域可见 */
    documentScroll:function(){
        var _t = this;
        var $body =this.parent.editor.document.$.documentElement;
        var $container = _t.popupComposer.container;
        var pos =$container.offset(),containerHeight = $container.height();
        if(pos.top+containerHeight-$body.scrollTop+150>_t.winHeight){
            $body.scrollTop = pos.top+containerHeight-_t.winHeight+150;
        }
    },
    /**
     * 重新打开待处理弹窗（点击生成块时）：无进行中任务且非当前弹窗则关闭旧弹窗并打开进度弹框
     * @param {*} relDom - 被点击的 DOM（如 .r-model-gen）
     * @returns {boolean} - 是否已处理（有进行中任务或已是当前弹窗时返回 false）
     */
    reOpenPopupProgress:function(relDom){
        var _t = this;
        var utils = _t.parent.utils;
        utils.focusInputFirst(relDom);
        if(_t.progressFlag==1||_t.parent.hasTask){  //有进行中的任务
            return false;
        }
        var jTar = $(relDom).closest('.new-textbox-content');
        if(_t.popup && _t.popup.relEl[0] == jTar[0]){
            return false;
        }else{
            _t.closePopup();
            _t.popupProgress(jTar[0],2);
        }
    },
    /**
     * 弹出进度条（保留/弃用）
     * @param {*} relDom - 关联的输入区域 DOM
     * @param {number} [flag] - 1=进行中，2=已完成，用于初始标题与按钮状态
     */
    popupProgress:function(relDom,flag){
        var _t = this,editor = this.parent.editor;
        if( _t.popup){
            return;
        }
        var $body =_t.$body= $(editor.document.getBody().$);
        _t.popup=$(relDom).popupMessage({
            message: '',
            // inside:true,
            type:2,
            theam:1,
            width:"350px",
            container:$(relDom).parents(".cke_widget_wrapper_emrWidget")
         });
         _t.popup.container.attr('contenteditable',false).find('.sk-popup-container').renderTpl($docAi_tpl['docAi/tpl/generate'],{});
         _t.popup.setPostion(2,-80);
         _t.manageProgress(flag||1);
         _t.popup.container.on('click','.btn-stop',function(){
            _t.stopGenerate();
        }).on('click','.btn-confirm',function(){ 
            _t.accpetAiResult(_t.popup.relEl[0],'r-model-gen');
            _t.closePopup();
        }).on('click','.btn-cancel',function(){
            _t.ignoreAiResult(_t.popup.relEl[0]);
            _t.closePopup();
        }).on('click',function(){
            return false;
        });

    },
    /**
     * 停止生成：通知端停止并清除打字定时器，弹框切为「完成」状态
     */
    stopGenerate:function(){
        var _t = this; 
        _t.parent.editorTool && _t.parent.editorTool.callCommand('stopGenerate');
        if (_t.fillInervalId) {
            clearInterval(_t.fillInervalId);
            _t.fillInervalId = null;
        }
        _t.manageProgress(2);
    //    _t.closePopup();
    },
    /**
     * 弃用 AI 结果：移除 r-model-gen 整块并恢复空白占位
     */
    ignoreAiResult:function(target,uucode){
        var _t = this;
        $(target).find('.r-model-gen').remove();
        _t.restoreBlankContent(target);
    },
    /**
     * 使用 AI 结果：用 r-model-gen-text 的正文替换整块 r-model-gen，保留/弃用按钮不再展示
     * @param {*} from - 'generateDocument' 时仅替换内容不移动光标，用于批量生成
     */
    accpetAiResult:function(target,className,from){
        var _t = this;
        var editor = this.parent.editor;
        var aiResult = $(target).find('.'+className);
        if (!aiResult.length) return;
        var textContent = aiResult.find('.r-model-gen-text').contents();
        aiResult.replaceWith(textContent);
        if(from=='generateDocument'){
            return;
        }
        // 非批量时：将光标移到该节点末尾
        var range = editor.createRange();
        var element = new CKEDITOR.dom.element(target);
        range.selectNodeContents(element);
        range.collapse(false); // 折叠到末尾

        editor.getSelection().selectRanges([range]);
        editor.focus();
    },
    /**
     * 插入 AI 临时结果到目标容器
     * 结构：r-model-gen > r-model-gen-text(正文) + r-model-gen-btn(「AI内容，请确认」)，单节点生成时按钮带 hidden 类，草稿时直接显示
     * @param {jQuery} JTar - 目标输入框容器
     * @param {Object} options - { className: 容器类名, text: 正文内容, uuid: 唯一标识, showBtn: 是否显示按钮（草稿为 true，单节点不传为 false） }
     */
    insertAiResult:function(JTar,options){
        var container = JTar.find('.'+options.className);
        if(container.length){
            container.find('.r-model-gen-text').html(options.text);
        }else{
            var btnClass = 'r-model-gen-btn' + (options.showBtn ? '' : ' r-model-gen-btn-hidden');
            container = $('<span>').attr({
                'class':options.className,
                'uucode':options.uuid
            }).append(
                $('<span>').addClass('r-model-gen-text').html(options.text),
                $('<span>').addClass(btnClass).text('AI内容，请确认')
            );
            JTar.removeAttr('_placeholdertext').append(container);
        }
    },
    /**
     * 管理进度弹框状态与按钮：进行中显示停止，完成后显示保留/弃用
     * @param {number} flag - 1=进行中，2=完成
     * @param {boolean} [isInterrupted] - 为 true 时标题显示「生成中断」
     */
    manageProgress:function(flag, isInterrupted){
        var _t = this;
        if(!_t.popup){
            return;
        }
        _t.progressFlag = flag;
        var popupContainer = _t.popup.container;
        if(flag==1){
            popupContainer.find('.btn-stop').addClass('popu-active');
            _t.parent.hasTask = true;
        }else{
            popupContainer.find('.doc-composer-title').text(isInterrupted ? '生成中断' : '生成完成');
            popupContainer.find('.btn-confirm').addClass('popu-active');
            popupContainer.find('.btn-cancel').addClass('popu-active');
            popupContainer.find('.btn-stop').removeClass('popu-active');
            _t.parent.hasTask = false;
        }
    },
    /**
     * 恢复空白备注：内容为空时根据 generate 属性写占位或生成备注，并设置 _placeholdertext 以应用 placeholder 样式
     * @param {*} inputDom - 输入框容器节点
     */
    restoreBlankContent: function (inputDom) {
        var _t = this;
        var content = $.trim(inputDom.innerText || inputDom.textContent).replace(zeroWidthChar, "");
        var Jm = $(inputDom);
        if (!content) {
            if(Jm.attr('generate')==1){
                _t.generateRemark(Jm);
            }else{
                var placeholder = Jm.closest('.new-textbox').attr('_placeholder') || '';
                Jm.text("\u200B" + placeholder);
            }
            Jm.attr('_placeholdertext', 'true');
        }
    },
    /**
     * 自动生成备注
     */
    generateRemark: function (JTar) {
        var _t = this;
        var newNode = $('<span class="r-model-gen-remark">');
        newNode.html('ctrl+/ 唤醒AI');
        JTar.html(newNode);
    },
    closePopup:function(){
        var _t = this;
        if(_t.popup){
            _t.popup.remove();
            _t.popup = null;
        }
    },
    /**
     * 病历生成 - 获取当前widget中可AI生成的数据元节点并进行批量生成
     */
    generateDocument: function() {
        var _t = this;
        var editorTool = _t.parent.editorTool;
        if(editorTool && editorTool.callCommand('isOpen')){
            return;
        }
        var editor = this.parent.editor;
        
        // 检查是否有进行中的任务
        if(_t.progressFlag==1 || _t.parent.hasTask){
            console.warn('有进行中的任务，请等待完成');
            return;
        }
        
        // 获取所有可AI生成的数据元节点
        var generateNodes;
        if(_t.parent.$widget && _t.parent.$widget.length > 0) {
            generateNodes = _t.parent.$widget.find('.new-textbox-content[generate="1"]');
        } else {
            console.warn('未找到可AI生成的病历');
            return;
        }
        
        if(generateNodes.length === 0) {
            console.warn('未找到可AI生成的数据元节点');
            return;
        }
        
        console.log('找到可AI生成的数据元节点数量:', generateNodes.length);
        
        // 初始化批量处理队列
        _t.batchQueue = [];
        _t.batchProcessedCount = 0;
        _t.batchTotalCount = generateNodes.length;
        _t.batchProcessing = false;
        
        // 将需要处理的节点添加到队列
        generateNodes.each(function(index, node) {
            var $node = $(node);
            
            // 检查节点是否已经有生成结果
            if($node.find('.r-model-gen').length === 0) {
                _t.batchQueue.push({
                    node: node,
                    index: index
                });
            } else {
                console.log('节点已有生成结果，跳过:', index);
            }
        });
        
        if(_t.batchQueue.length === 0) {
            console.warn('所有节点都已有生成结果或无需处理');
            return;
        }
        
        console.log('病历生成已启动，将处理', _t.batchQueue.length, '个数据元节点');
        
        // 开始处理第一个节点
        _t.processNextBatchNode();
    },
    
    /**
     * 处理批量队列中的下一个节点
     */
    processNextBatchNode: function() {
        var _t = this;
        
        if(_t.batchProcessing) {
            return; // 正在处理中，避免重复调用
        }
        
        if(_t.batchQueue.length === 0) {
            // 所有节点处理完成
            _t.batchProcessing = false;
            console.log('批量处理完成，共处理', _t.batchProcessedCount, '个节点');
            return;
        }
        
        _t.batchProcessing = true;
        var nextNode = _t.batchQueue.shift();
        
        console.log('开始处理节点:', nextNode.index, '剩余:', _t.batchQueue.length);
        
        try {
            _t.generateMessage(nextNode.node, 2, 'generateDocument');
            _t.batchProcessedCount++;
        } catch(e) {
            console.error('处理节点失败:', e);
            // 即使失败也要继续处理下一个
            _t.batchProcessing = false;
            setTimeout(function() {
                _t.processNextBatchNode();
            }, 100);
        }
    },

    /**
     * 在容器内根据 keyCode/keyName 解析目标输入框 .new-textbox-content，找不到返回 null
     * @param {jQuery} $container 文档节点容器
     * @param {Object} dataItem 数据元项 { keyCode, keyName }
     * @returns {jQuery|null}
     */
    _getAiDraftContentBox: function ($container, dataItem) {
        var $node = null;
        if (dataItem.keyCode) {
            $node = $container.find('[data-hm-code="' + dataItem.keyCode + '"]:not([data-hm-node="labelbox"])');
        }
        if (!$node || $node.length === 0) {
            if (dataItem.keyName) {
                $node = $container.find('[data-hm-name="' + dataItem.keyName + '"]:not([data-hm-node="labelbox"])');
            }
        }
        if (!$node || $node.length === 0) {
            if ($container.attr('data-hm-code') === dataItem.keyCode || $container.attr('data-hm-name') === dataItem.keyName) {
                $node = $container;
            }
        }
        if (!$node || $node.length === 0) return null;
        var $target = $node.first();
        var $content = $target.hasClass('new-textbox-content') ? $target : $target.find('.new-textbox-content').first();
        return $content.length ? $content : null;
    },

    /**
     * 规范化数据元 keyValue：数组转拼接字符串，其它转 String，空值转 ''
     * @param {*} val
     * @returns {String}
     */
    _normalizeKeyValue: function (val) {
        if (Array.isArray(val)) return val.join('');
        return val !== undefined && val !== null ? String(val) : '';
    },

    /**
     * 显示AI草稿内容（支持多份病历）
     * 与单节点生成保持一致：在对应数据元的 .new-textbox-content 内插入 r-model-gen 结构（正文 +「AI内容，请确认」），点击后复用单节点弹框与保留/弃用逻辑
     * @param {Array} dataList 内容列表，每项格式同 setDocData
     * @param {Number} displayType 展示方式：0-覆盖（先清空原内容再展示），1-追加（默认）
     * @param {String} dataList[].code 文档唯一编号
     * @param {Array} dataList[].data 数据元列表
     * @param {String} dataList[].data[].keyCode 数据元编码
     * @param {String} dataList[].data[].keyName 数据元名称
     * @param {String|String[]} dataList[].data[].keyValue 数据元内容
     */
    showAiDraft: function (dataList, displayType) {
        var _t = this;
        var utils = _t.parent.utils;

        _t.closePopup();

        if (!dataList || !Array.isArray(dataList) || dataList.length === 0) return;
        displayType = displayType === 0 ? 0 : 1;

        var editor = _t.parent.editor;
        if (!editor || !editor.document || !editor.document.$) {
            console.warn('showAiDraft: 编辑器或文档未就绪');
            return;
        }
        var $doc = $(editor.document.$);

        dataList.forEach(function (item) {
            if (!item.code) return;
            var $nodes = $doc.find('[doc_code="' + item.code + '"]');
            if ($nodes.length === 0) return;

            (item.data || []).forEach(function (dataItem) {
                if (!dataItem.keyCode && !dataItem.keyName) return;
                if (dataItem.keyCode && dataItem.keyCode.indexOf('TABLE_') === 0) return;

                var text = _t._normalizeKeyValue(dataItem.keyValue);

                $nodes.each(function () {
                    var $content = _t._getAiDraftContentBox($(this), dataItem);
                    if (!$content) return;

                    var $existingGen = $content.find('.r-model-gen');
                    if (displayType === 0) {
                        $existingGen.remove();
                        $content.removeAttr('_placeholdertext').empty();
                    } else if ($existingGen.length > 0) {
                        $existingGen.remove();
                    }

                    _t.insertAiResult($content, {
                        className: 'r-model-gen',
                        text: text,
                        uuid: utils.getUUId(),
                        showBtn: true
                    });
                });
            });
        });
    },
    /**
     * 获取待处理的 AI 草稿块列表（.r-model-gen 节点，支持按 keyList 筛选）
     * @param {Array|String} [keyList] - 数据元编码数组或单个编码（可选），不传返回全部
     * @returns {jQuery} 匹配的 .r-model-gen 元素集合
     */
    _getAiDraftFileds: function (keyList) {
        var _t = this;
        // 获取编辑器实例
        var editor = _t.parent.editor;
        // 若无编辑器或文档对象，则返回空集合
        if (!editor || !editor.document) return $();
        // 获取文档 body
        var $body = $(editor.document.getBody().$);
        // 查找所有 .r-model-gen 元素（AI 草稿块）
        var $all = $body.find('.r-model-gen');
        // 若不传 keyList，返回全部草稿节点
        if (!keyList) return $all;
        // 标准化 keyList 为数组
        var list = Array.isArray(keyList) ? keyList : [keyList];
        // 若筛选列表为空，返回全部草稿节点
        if (list.length === 0) return $all;
        // 根据数据元编码筛选相应的草稿节点
        return $all.filter(function () {
            var code = $(this).closest('span[data-hm-code]').attr('data-hm-code');
            return code && list.indexOf(code) !== -1;
        });
    },
    /**
     * AI 草稿确认（采纳）：支持全部或按 keyList 批量确认，与单节点一致用 accpetAiResult 替换内容
     * 步骤：关闭进度弹框 → 按 keyList 获取待确认的 .r-model-gen 草稿节点（不传则全部）→ 逐条采纳（用 r-model-gen-text 正文替换整块 r-model-gen）
     * @param {Array|String} [keyList] 数据元编码数组，不传则确认全部 AI 草稿
     */
    confirmAiDraft: function (keyList) {
        var _t = this;
        _t.closePopup(); // 关闭进度弹框
        var $fileds = _t._getAiDraftFileds(keyList); // 按 keyList 获取待确认的 .r-model-gen 草稿节点（不传则全部）
        $fileds.each(function () {
            var target = $(this).closest('.new-textbox-content')[0];
            if (target) _t.accpetAiResult(target, 'r-model-gen'); // 用 r-model-gen-text 正文替换整块 r-model-gen
        });
    },
    /**
     * AI 草稿弃用（取消）：支持全部或按 keyList 批量弃用，与单节点一致用 ignoreAiResult
     * @param {Array|String} [keyList] 数据元编码数组，不传则弃用全部 AI 草稿
     */
    cancelAiDraft: function (keyList) {
        var _t = this;
        _t.closePopup();
        var $fileds = _t._getAiDraftFileds(keyList);
        $fileds.each(function () {
            var target = $(this).closest('.new-textbox-content')[0];
            if (target) _t.ignoreAiResult(target, 'r-model-gen');
        });
    }
});
