/**
 * @license Copyright (c) 2024, HM Editor - Document Tree Plugin. All rights reserved.
 */

(function() {
	
	// 解析文档结构 - 按照病历逻辑结构（页眉、主体、页脚）和数据元
	function parseDocumentStructure(editor) {
		// 重置全局索引计数器
		globalIndexCounter.value = 0;
		
		// 获取文档信息列表
		var documentsMap = {};
		
		// 从.emrWidget-content元素获取文档信息
		var bodyElement = editor.document.getBody();
		var emrWidgetContents = bodyElement.find('.emrWidget-content');
		
		if (emrWidgetContents && emrWidgetContents.count() > 0) {
			for (var i = 0; i < emrWidgetContents.count(); i++) {
				var content = emrWidgetContents.getItem(i);
				var name = content.getAttribute('data-hm-widgetname') || '';
				var id = content.getAttribute('data-hm-widgetid') || '';
				
				if (name || id) {
					// 使用ID作为key进行去重，如果ID为空则使用name作为key
					var key = id || name;
					if (!documentsMap[key]) {
						documentsMap[key] = {
							name: name,
							id: id
						};
					}
				}
			}
		}
		
		// 将Map转换为数组
		var documents = Object.values(documentsMap);
		
		// 如果没有找到任何文档，添加一个默认文档
		if (documents.length === 0) {
			documents.push({
				name: '未命名文档',
				id: ''
			});
		}
		
		var documentStructure = {
			documents: documents,
			header: [],
			main: [],
			footer: []
		};
		
		// 直接使用编辑器的body元素，避免获取到重复的分页内容
		var bodyElement = editor.document.getBody();
		
		// 获取所有数据元
		var allDataElements = bodyElement.find('[data-hm-node][data-hm-code]');
		
		// 获取页眉（只取第一份页眉表格，不处理嵌套）
		var headerTables = bodyElement.find('table[_paperheader="true"]');
		if (headerTables.count() > 0) {
			var headerElement = headerTables.getItem(0); // 只取第一个页眉
			var headerDataElements = headerElement.find('[data-hm-node]');
			for (var j = 0; j < headerDataElements.count(); j++) {
				var dataElement = headerDataElements.getItem(j);
				var dataInfo = parseDataElementSimple(dataElement);
				if (dataInfo) {
					dataInfo.section = 'header';
					dataInfo.index = globalIndexCounter.value++;
					documentStructure.header.push(dataInfo);
				}
			}
		}
		
		// 获取页脚（只取最后一页的页脚表格）
		var footerTables = bodyElement.find('table[_paperfooter="true"]');
		if (footerTables.count() > 0) {
			var footerElement = footerTables.getItem(footerTables.count() - 1); // 只取最后一个页脚
			var footerDataElements = footerElement.find('[data-hm-node]');
			
			// 先解析常规数据元（页脚不处理嵌套）
			for (var j = 0; j < footerDataElements.count(); j++) {
				var dataElement = footerDataElements.getItem(j);
				var dataInfo = parseDataElementSimple(dataElement);
				if (dataInfo) {
					dataInfo.section = 'footer';
					dataInfo.index = globalIndexCounter.value++;
					documentStructure.footer.push(dataInfo);
				}
			}
			
			// 如果没有找到数据元，查找页码span标签
			if (documentStructure.footer.length === 0) {
				var pageSpans = footerElement.find('span.page');
				if (pageSpans.count() > 0) {
					var pageSpan = pageSpans.getItem(0);
					var pageInfo = {
						type: '页码',
						name: '页码',
						element: pageSpan,
						nodeType: 'page',
						id: pageSpan.getAttribute('id') || '',
						section: 'footer',
						index: 0
					};
					documentStructure.footer.push(pageInfo);
				}
			}
		}
		
		// 获取主体内容（除了页眉页脚之外的所有数据元，只解析顶层数据元）
		for (var i = 0; i < allDataElements.count(); i++) {
			var dataElement = allDataElements.getItem(i);
			
			// 检查是否在页眉或页脚中
			var isInHeader = false;
			var isInFooter = false;
			var parent = dataElement.getParent();
			
			while (parent && parent.getName) {
				if (parent.getName() === 'table' && parent.getAttribute('_paperheader') === 'true') {
					isInHeader = true;
					break;
				}
				if (parent.getName() === 'table' && parent.getAttribute('_paperfooter') === 'true') {
					isInFooter = true;
					break;
				}
				parent = parent.getParent();
			}
			
			// 检查是否是嵌套在其他数据元中的子数据元
			var isNestedElement = false;
			var checkParent = dataElement.getParent();
			while (checkParent && !isInHeader && !isInFooter) {
				if (checkParent.getAttribute && checkParent.getAttribute('data-hm-node') &&  checkParent.getAttribute('data-hm-code') &&
					checkParent.getAttribute('data-hm-node') !== 'labelbox') {
					isNestedElement = true;
					break;
				}
				if (checkParent.getName && checkParent.getName() === 'body') {
					break;
				}
				checkParent = checkParent.getParent();
				// 遇到 .emrWidget-content 容器则停止向上查找，不视为数据元父级
				if (checkParent) {
					var className = checkParent.getAttribute && checkParent.getAttribute('class');
					if (className && className.indexOf('emrWidget-content') !== -1) {
						break;
					}
				}
			}
			
			// 如果不在页眉页脚中，且不是嵌套的子数据元，则属于主体顶层数据元
			if (!isInHeader && !isInFooter && !isNestedElement) {
				var dataInfo = parseDataElement(dataElement);
				if (dataInfo) {
					assignIndicesRecursively(dataInfo, documentStructure.main, 'main');
				}
			}
		}
		
		return documentStructure;
	}
	
	// 检查是否是顶层数据元（在指定容器内没有其他数据元父级）
	function isTopLevelElement(element, container) {
		var parent = element.getParent();
		while (parent && !parent.equals(container)) {
			if (parent.getAttribute && parent.getAttribute('data-hm-node') && 
				parent.getAttribute('data-hm-node') !== 'labelbox') {
				return false;
			}
			parent = parent.getParent();
		}
		return true;
	}
	
	// 全局索引计数器
	var globalIndexCounter = { value: 0 };
	
	// 为数据元及其子元素递归分配索引
	function assignIndicesRecursively(dataInfo, targetArray, section) {
		dataInfo.index = globalIndexCounter.value++;
		dataInfo.section = section;
		targetArray.push(dataInfo);
		
		// 为子数据元递归分配索引，但不加入主数组（子数据元只存在于父数据元的children中）
		if (dataInfo.children && dataInfo.children.length > 0) {
			for (var i = 0; i < dataInfo.children.length; i++) {
				var child = dataInfo.children[i];
				child.index = globalIndexCounter.value++;
				child.section = section;
				
				// 继续为子数据元的子数据元分配索引
				assignChildrenIndices(child, section);
			}
		}
	}
	
	// 为子数据元递归分配索引
	function assignChildrenIndices(dataInfo, section) {
		if (dataInfo.children && dataInfo.children.length > 0) {
			for (var i = 0; i < dataInfo.children.length; i++) {
				var child = dataInfo.children[i];
				child.index = globalIndexCounter.value++;
				child.section = section;
				assignChildrenIndices(child, section);
			}
		}
	}
	
	// 解析数据元信息（简单版本，不处理嵌套）
	function parseDataElementSimple(element) {
		var nodeType = element.getAttribute('data-hm-node');
		if (!nodeType) return null;
		
		// 过滤掉标题类型的数据元
		if (nodeType === 'labelbox') {
			return null;
		}
		
		var dataInfo = {
			type: getDataElementTypeName(nodeType, element),
			name: getDataElementName(element),
			element: element,
			nodeType: nodeType,
			id: element.getAttribute('data-hm-id') || '',
			children: null, // 简单版本不处理子数据元
			parent: null,
			level: 0
		};
		
		// 如果没有名称，跳过
		if (!dataInfo.name || dataInfo.name.trim() === '') {
			return null;
		}
		
		return dataInfo;
	}
	
	// 解析数据元信息（支持嵌套结构）
	function parseDataElement(element, parentInfo) {
		var nodeType = element.getAttribute('data-hm-node');
		if (!nodeType) return null;
		
		// 过滤掉标题类型的数据元
		if (nodeType === 'labelbox') {
			return null;
		}
		
		var dataInfo = {
			type: getDataElementTypeName(nodeType, element),
			name: getDataElementName(element),
			element: element,
			nodeType: nodeType,
			id: element.getAttribute('data-hm-id') || '', // 添加数据元唯一ID
			children: [], // 子数据元数组
			parent: parentInfo || null, // 父数据元引用
			level: parentInfo ? parentInfo.level + 1 : 0 // 嵌套层级
		};
		
		// 如果没有名称，跳过
		if (!dataInfo.name || dataInfo.name.trim() === '') {
			return null;
		}
		
		// 查找嵌套的子数据元
		var childElements = element.find('[data-hm-node]');
		for (var i = 0; i < childElements.count(); i++) {
			var childElement = childElements.getItem(i);
			
			// 确保子元素不是当前元素本身，且是直接子元素
			if (childElement !== element && isDirectChild(element, childElement)) {
				var childInfo = parseDataElement(childElement, dataInfo);
				if (childInfo) {
					dataInfo.children.push(childInfo);
				}
			}
		}
		
		return dataInfo;
	}
	
	// 检查childElement是否是parentElement的直接子元素（而不是孙子元素等）
	function isDirectChild(parentElement, childElement) {
		var immediateParent = childElement.getParent();
		while (immediateParent && !immediateParent.equals(parentElement)) {
			// 如果中间有其他数据元，则不是直接子元素
			if (immediateParent.getAttribute('data-hm-node')) {
				return false;
			}
			immediateParent = immediateParent.getParent();
		}
		return immediateParent && immediateParent.equals(parentElement);
	}
	
	// 获取数据元类型名称
	function getDataElementTypeName(nodeType, element) {
		switch (nodeType) {
			case 'newtextbox':
				var textType = element.getAttribute('_texttype');
				if (textType) {
					return textType; // 如：纯文本、时间文本、数字文本、下拉、条形码、二维码
				}
				return '纯文本';
			case 'timebox':
				return '时间';
			case 'searchbox':
				return '搜索';
			case 'radiobox':
				return '单选';
			case 'checkbox':
				return '多选';
			case 'cellbox':
				return '单元';
			default:
				return nodeType;
		}
	}
	
	// 获取数据元名称
	function getDataElementName(element) {
		var name = '';
		
		// 优先从 data-hm-name 属性获取
		name = element.getAttribute('data-hm-name');
		if (name && name.trim() !== '') {
			return name.trim();
		}
		
		// 没有 data-hm-name 则取 _placeholder
		name = element.getAttribute('_placeholder');
		if (name && name.trim() !== '' && name.trim() !== '-') {
			name = name.trim();
			return name.length > 10 ? name.substring(0, 10) : name;
		}
		
		return '';
	}
	
	// 在数据元数组中（包括嵌套的子数据元）查找指定索引的数据元
	function findDataElementByIndex(dataArray, targetIndex) {
		for (var i = 0; i < dataArray.length; i++) {
			var dataInfo = dataArray[i];
			
			// 如果是目标索引，直接返回
			if (dataInfo.index === targetIndex) {
				return dataInfo;
			}
			
			// 在子数据元中递归查找
			if (dataInfo.children && dataInfo.children.length > 0) {
				var found = findDataElementByIndex(dataInfo.children, targetIndex);
				if (found) {
					return found;
				}
			}
		}
		
		return null;
	}
	
	// 在数据元数组中查找指定索引的数据元（简单版本，不递归）
	function findDataElementByIndexSimple(dataArray, targetIndex) {
		for (var i = 0; i < dataArray.length; i++) {
			if (dataArray[i].index === targetIndex) {
				return dataArray[i];
			}
		}
		return null;
	}
	
	// 跳转到指定数据元
	function jumpToElement(editor, section, elementIndex, structure) {
		var targetDataInfo = null;
		
		// 根据section和index找到目标数据元
		switch (section) {
			case 'header':
				// 页眉不支持嵌套，直接在数组中查找
				targetDataInfo = findDataElementByIndexSimple(structure.header, elementIndex);
				break;
			case 'main':
				// 主体支持嵌套，递归查找
				targetDataInfo = findDataElementByIndex(structure.main, elementIndex);
				break;
			case 'footer':
				// 页脚不支持嵌套，直接在数组中查找
				targetDataInfo = findDataElementByIndexSimple(structure.footer, elementIndex);
				break;
		}
		
		if (!targetDataInfo || !targetDataInfo.element) {
			return;
		}
		
		try {
			// 查找编辑器中对应的元素
			var nodeType = targetDataInfo.nodeType;
			var targetName = targetDataInfo.name;
			var targetId = targetDataInfo.id;
			
			// 在编辑器文档中查找对应的数据元
			var editorBody = editor.document.getBody();
			var targetElement = null;
			
			// 特殊处理页码元素
			if (nodeType === 'page' && section === 'footer') {
				// 查找页脚中的页码span标签
				var spanpage = editorBody.find('span.page');
				if (spanpage.count() > 1) {
					var spanpagecurpage = editorBody.find('span.page[curpage]');
					targetElement = spanpagecurpage.getItem(spanpagecurpage.count() - 1);
				}else{
                    targetElement = spanpage.getItem(0);
                }
			} else {
				// 优先使用data-hm-id精确定位
				if (targetId && targetId.trim() !== '') {
					targetElement = editorBody.findOne('[data-hm-id="' + targetId + '"]');
				}
				
				// 如果通过ID没找到，则回退到通过节点类型和名称查找
				if (!targetElement) {
					var matchingElements = editorBody.find('[data-hm-node="' + nodeType + '"][data-hm-name="' + targetName + '"]');
					if (matchingElements.count() > 0) {
						targetElement = matchingElements.getItem(0);
					}
				}
			}
			
			// 如果找到了目标元素，进行跳转
			if (targetElement) {
				// 创建范围并选中元素
				var range = editor.createRange();
				range.selectNodeContents(targetElement);
				
				// 设置选区
				var selection = editor.getSelection();
				selection.selectRanges([range]);
				editor.focus();
				// 平滑滚动到视图中，确保数据元在可视范围内
				try {
					if (targetElement.$.scrollIntoView) {
						// 使用原生scrollIntoView方法，支持平滑滚动
						targetElement.$.scrollIntoView({
							behavior: 'smooth',    // 平滑滚动
							block: 'center',      // 垂直居中显示
							inline: 'nearest'     // 水平方向就近显示
						});
					} else {
						// 回退到CKEditor的scrollIntoView方法
						targetElement.scrollIntoView();
					}
				} catch (e) {
					// 最后回退到基本的scrollIntoView
					targetElement.scrollIntoView();
				}
				
				// 聚焦编辑器
				// editor.focus();
				
				// 添加高亮效果
				addHighlightEffect(targetElement);
			}
		} catch (e) {
			console.error('跳转到数据元时出错:', e);
		}
	}
	
	// 添加高亮效果
	function addHighlightEffect(element) {
		// 移除之前的高亮效果
		removeHighlightEffect();
		
		// 添加高亮样式类
		element.addClass('cke_node_highlight');
		
		// 记录当前高亮的元素，方便后续清除
		addHighlightEffect.currentElement = element;
		
		// 3秒后自动移除高亮效果
		setTimeout(function() {
			removeHighlightEffect();
		}, 3000);
	}
	
	// 移除高亮效果
	function removeHighlightEffect() {
		if (addHighlightEffect.currentElement) {
			addHighlightEffect.currentElement.removeClass('cke_node_highlight');
			addHighlightEffect.currentElement = null;
		}
	}
	
	
	CKEDITOR.dialog.add('documenttree', function(editor) {
		var lang = editor.lang.documenttree;
		
		return {
			title: lang.title,
			resizable: CKEDITOR.DIALOG_RESIZE_BOTH,
			minWidth: 300,
			minHeight: 400,
			// 非模态对话框按钮配置
			buttons: [
				CKEDITOR.dialog.cancelButton(editor, {
					label: lang.close
				})
			],
			contents: [{
				id: 'tree',
				label: lang.documentStructure,
				title: lang.documentStructure,
				elements: [{
					type: 'html',
					id: 'documentTreeContainer',
					className: 'cke_document_tree_container',
					html: '<iframe id="cke_document_tree_iframe" style="width: 100%; height: 400px; border: none; border-radius: 4px;"></iframe>',
					onLoad: function() {
						// 容器加载完成后的处理
					}
				}]
			}],
			
			onShow: function() {
				var dialog = this;
				
				// 解析文档结构
				var structure = parseDocumentStructure(editor);
				
				// 隐藏iframe直到内容加载完成
				$('#cke_document_tree_iframe').hide();
				
				var init = function() {
					$('#cke_document_tree_iframe').show();				
					// 渲染文档树
					window.renderDocumentTree && window.renderDocumentTree(structure, editor.lang.documenttree || {
						noContent: '当前文档没有可显示的数据元内容'
					});
					// 设置跳转函数
					window.jumpToElement = function(section, elementIndex, structureData) {
						jumpToElement(editor, section, elementIndex, structure);
					};
				}
				
				var iframe = $('#cke_document_tree_iframe')[0];
				// 使用getTplHtml加载模板内容
				$.getTplHtml(CKEDITOR.plugins.getPath('documenttree') + 'dialogs/tree.html', {}, function(bodyHtml) {
					var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
					iframeDoc.open();
					iframeDoc.write(bodyHtml);
					iframeDoc.close();
					
					// 设置onload事件
					if (iframe.attachEvent) {
						iframe.attachEvent("onload", function() {
							init();
						});
					} else {
						iframe.onload = function() {
							init();
						};
					}
				});
				
				// 设置对话框样式 - 非模态样式
				var dialogElement = this.getElement().getFirst();
				dialogElement.setStyle('border', '1px solid #bcbcbc');
				dialogElement.setStyle('box-shadow', '0 4px 12px rgba(0,0,0,0.15)');
			},
			
			onLoad: function() {
				// 样式已移至全局 contents.css
			}
		};
	});
	
})();
