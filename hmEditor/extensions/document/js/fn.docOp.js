/**
 * 文档操作模块
 * 包含删除文档等文档级操作
 */
commonHM.component['documentModel'].fn({
    /**
     * 删除文档内容
     * @param {String|Array} docCode 文档唯一编号，可以是单个值或数组
     * @returns {Boolean} 是否成功删除
     */
    deleteContent: function (docCode) {
        var _t = this;
        var editor = _t.editor;
        
        // 参数验证
        if (!docCode) {
            console.error('deleteContent: docCode 参数不能为空');
            return false;
        }
        
        // 将单个值转换为数组
        var docCodeArray = Array.isArray(docCode) ? docCode : [docCode];
        
        if (docCodeArray.length === 0) {
            console.error('deleteContent: docCode 数组不能为空');
            return false;
        }
        
        var $body = $(editor.document.getBody().$);
        
        // 如果当前只剩一个文档，不允许删除（删除后将无文档）
        var $allWidgets = $body.find('[data-hm-widgetid]');
        if ($allWidgets.length <= 1) {
            console.warn('deleteContent: 当前仅剩一个文档，不允许删除');
            return false;
        }
        
        var deletedCount = 0;
        var deletedCodes = [];
        
        // 如果开启了实时分页，先移除所有分页
        var needRepaging = false;
        if (editor.HMConfig && editor.HMConfig.realtimePageBreak) {
            needRepaging = true;
            // 触发删除病历前事件，移除分页
            editor.fire('beforeDeleteEmrRecord');
        }
        
        // 遍历要删除的 docCode
        for (var i = 0; i < docCodeArray.length; i++) {
            var code = docCodeArray[i];
            if (!code) {
                console.warn('deleteContent: 跳过空的 docCode');
                continue;
            }
            
            // 通过 data-hm-widgetid 查找文档元素
            var $widget = $body.find('[data-hm-widgetid="' + code + '"]');
            
            // 如果没找到，尝试通过 doc_code 属性查找
            if ($widget.length === 0) {
                $widget = $body.find('[doc_code="' + code + '"]');
            }
            
            if ($widget.length === 0) {
                console.warn('deleteContent: 未找到对应的病历，docCode=' + code);
                continue;
            }
            
            // 获取第一个匹配的元素
            var $targetElement = $widget.first();
            
            // 向上查找包含 data-cke-widget-wrapper 的外层div
            var $wrapper = $targetElement.closest('[data-cke-widget-wrapper]');
            
            // 判断是否是第一个widget（检查前面是否还有其他wrapper）
            var isFirstWidget = $wrapper.prev('[data-cke-widget-wrapper]').length === 0;
            // 判断是否是最后一个widget（检查后面是否还有其他wrapper）
            var isLastWidget = $wrapper.next('[data-cke-widget-wrapper]').length === 0;
            
            // 如果是非实时分页且删除的是第一个widget，检查被删除的文档是否包含页眉
            if (!needRepaging && isFirstWidget) {
                // 在被删除的widget内查找页眉表格
                var $headerTable = $targetElement.find('table[_paperheader="true"]').first();
                
                // 如果找到了页眉，需要移动到下一个widget
                if ($headerTable.length > 0) {
                    // 通过$wrapper直接查找下一个widget wrapper
                    var $nextWrapper = $wrapper.next('[data-cke-widget-wrapper]');
                    
                    // 如果找到了下一个wrapper，查找其中的widget内容
                    if ($nextWrapper.length > 0) {
                        // 在下一个wrapper中查找包含data-hm-widgetid的元素
                        var $nextWidget = $nextWrapper.find('[data-hm-widgetid]').first();
                        
                        if ($nextWidget.length > 0) {
                            // 克隆页眉表格（因为原widget会被删除）
                            var $clonedHeader = $headerTable.clone(true);
                            $nextWidget.prepend($clonedHeader[0]);
                            console.log('deleteContent: 已将页眉移动到下一个widget，docCode=' + code);
                        } else {
                            console.warn('deleteContent: 在下一个wrapper中未找到widget内容，docCode=' + code);
                        }
                    } else {
                        console.warn('deleteContent: 未找到下一个widget wrapper，无法移动页眉，docCode=' + code);
                    }
                }
            }
            
            // 如果是非实时分页且删除的是最后一个widget，检查被删除的文档是否包含页脚
            if (!needRepaging && isLastWidget) {
                // 在被删除的widget内查找页脚表格
                var $footerTable = $targetElement.find('table[_paperfooter="true"]').first();
                
                // 如果找到了页脚，需要移动到上一个widget
                if ($footerTable.length > 0) {
                    // 通过$wrapper直接查找上一个widget wrapper
                    var $prevWrapper = $wrapper.prev('[data-cke-widget-wrapper]');
                    
                    // 如果找到了上一个wrapper，查找其中的widget内容
                    if ($prevWrapper.length > 0) {
                        // 在上一个wrapper中查找包含data-hm-widgetid的元素
                        var $prevWidget = $prevWrapper.find('[data-hm-widgetid]').first();
                        
                        if ($prevWidget.length > 0) {
                            // 如果上一个widget里面已经有页脚，先删除它
                            var $existingFooter = $prevWidget.find('table[_paperfooter="true"]');
                            if ($existingFooter.length > 0) {
                                $existingFooter.remove();
                                console.log('deleteContent: 已删除上一个widget中的页脚，docCode=' + code);
                            }
                            
                            // 克隆页脚表格（因为原widget会被删除）
                            var $clonedFooter = $footerTable.clone(true);
                            // 将页脚追加到上一个widget的末尾
                            $prevWidget.append($clonedFooter[0]);
                            console.log('deleteContent: 已将页脚移动到上一个widget，docCode=' + code);
                        } else {
                            console.warn('deleteContent: 在上一个wrapper中未找到widget内容，docCode=' + code);
                        }
                    } else {
                        console.warn('deleteContent: 未找到上一个widget wrapper，无法移动页脚，docCode=' + code);
                    }
                }
            }
            
            $wrapper.remove();
            
            deletedCount++;
            deletedCodes.push(code);
            
            // 删除后检查剩余文档数，如果只剩1个则停止删除
            var $remainingWidgets = $body.find('[data-hm-widgetid]');
            if ($remainingWidgets.length <= 1) {
                console.warn('deleteContent: 删除后仅剩一个文档，停止继续删除');
                break;
            }
        }
        
        if (deletedCount === 0) {
            console.warn('deleteContent: 没有找到任何要删除的病历');
            // 如果开启了实时分页，需要恢复分页
            if (needRepaging) {
                CKEDITOR.plugins.pagebreakCmd.performAutoPaging(editor, {
                    name: '删除文档后分页',
                    data: {
                        source: 'deleteContent'
                    }
                });
            }
            return false;
        }
        
        
        // 如果开启了实时分页，重新进行分页
        if (needRepaging) {
            CKEDITOR.plugins.pagebreakCmd.performAutoPaging(editor, {
                name: '删除文档后分页',
                data: {
                    source: 'deleteContent'
                }
            });
            
            // 保存分页后的快照
            editor.fire('saveSnapshot', {
                name: 'afterDeleteDocContentPaging',
                tagName: 'afterDeleteDocContentPaging'
            });
        }
        
        console.log('deleteContent: 成功删除 ' + deletedCount + ' 个病历，docCode=' + deletedCodes.join(','));
        return true;
    }
});
