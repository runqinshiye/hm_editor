
CKEDITOR.plugins.add( 'paper', {
	requires: 'dialog',
	icons: 'paper', // %REMOVE_LINE_CORE%
	// 以毫米为单位的纸张宽度 (这里加单位(mm))
	paperOptMm:{
		'A4_portrait':{
			'width' : '210mm',
			'height' : '297mm'
		},
		'A4_landscape':{
			'width' : '297mm',
			'height' : '210mm'
		},
		'A3_portrait':{
			'width' : '297mm',
			'height' : '420mm'
		},
		'A3_landscape':{
			'width' : '420mm',
			'height' : '297mm'
		},
		'A5_portrait':{
			'width' : '148mm',
			'height' : '210mm'
		},
		'A5_landscape':{
			'width' : '210mm',
			'height' : '148mm'
		},
		'B5_portrait': {
			'width': '176mm',
			'height': '250mm'
		},
		'B5_landscape': {
			'width': '250mm',
			'height': '176mm'
		}
	},
	// 以 px 为单位的纸张宽度 (不加单位了)
	paperOptPx:{
	},
	// 默认 dpi
	dpi: 96,
	dpiConvert:0, //1英寸=25.4mm
	init: function( editor ) {
		editor.addCommand( 'paper', new CKEDITOR.dialogCommand( 'paper',{readOnly: 1} ) );

		// 初始化所有纸张大小, 化为整数像素的格式.
		var dpiConvert = this.dpi / 25.4;
		this.dpiConvert = dpiConvert;
		for (var paperSize in this.paperOptMm) {
			this.paperOptPx[paperSize] = {
				width: Math.floor(dpiConvert * parseFloat(this.paperOptMm[paperSize].width)),
				height: Math.floor(dpiConvert * parseFloat(this.paperOptMm[paperSize].height))
			};
		}

		editor.addCommand( 'paperSize', {
			readOnly: 1,
			/**
			 * data 的格式有几种选择:
			 * 1. string - 纸张样式: 'A4_portrait$top:15mm#right:10mm#bottom:5mm#left:10mm'
			 *
			 * 2. JsonObject - {paperSizeString: 纸张样式, 格式和1中的 string 一样,
			 * 					name: 用于(广播等)事件溯源}
			 *
			 * YanJunwei 20220606
			 * 3. JsonObject - {paperSize: 'A4_portrait',
			 * 					paperMargin: '15mm#right:10mm#bottom:5mm#left:10mm'
			 * 					name - string: 事件名, 用于(广播等)事件溯源}
			 */
			exec: function (editor, data) {
				// region 处理 data 的格式
				if (typeof data === 'string') {
					data = {paperSizeString: data};
				}
				if (typeof data.paperSizeString === 'string') {
					if(data.paperSizeString.indexOf('$') < 0){
						data.paperSize = data;
						data.paperMargin = JSON.parse('{"top":"10mm","right":"15mm","bottom":"10mm","left":"15mm"}');
					}else{
						var datas = data.paperSizeString.split('$');
						var margins = datas[1].split('#');
						var top = '"top"' + ':' + '"' + margins[0].split(':')[1] + '"';
						var right = '"right"' + ':' + '"' + margins[1].split(':')[1] + '"';
						var bottom = '"bottom"' + ':' + '"' + margins[2].split(':')[1] + '"';
						var left = '"left"' + ':' + '"' + margins[3].split(':')[1] + '"';
						data.paperSize = datas[0];
						data.paperMargin =  JSON.parse( '{' + top + "," + right + "," + bottom + "," + left + '}' );
					}
				}
				// endregion


				//var editor = CKEDITOR.currentInstance;
				var body = editor.document.getBody();
				var paperOptPx = editor.plugins.paper.paperOptPx;
				var paperSize = data["paperSize"];
				var paperMargin = data["paperMargin"];

				// 判断 body 中的属性是否相同, 如果不同才设置页面, 不然会引起已经分页的页面的padding发生重复.
				var newPaperSizeStyle = paperSize + '$' + 'top:' + paperMargin.top + '#' + 'right:' + paperMargin.right + '#' + 'bottom:' + paperMargin.bottom + '#' + 'left:' + paperMargin.left;
				if (body.getAttribute('data-hm-paperSize') === newPaperSizeStyle) {
					return;
				}
				body.setAttribute('data-hm-paperSize', newPaperSizeStyle);

				var paperCmd = CKEDITOR.plugins.paperCmd;
				if (paperSize && paperOptPx[paperSize]) {
					// 设置页边距, 宽度采用四舍五入
					paperCmd.paperMarginPx = {
						top: Math.round(dpiConvert * parseFloat(paperMargin.top)),
						right: Math.round(dpiConvert * parseFloat(paperMargin.right)),
						bottom: Math.round(dpiConvert * parseFloat(paperMargin.bottom)),
						left: Math.round(dpiConvert * parseFloat(paperMargin.left))
					};
					body.setStyle('padding-right', paperCmd.paperMarginPx.right+ 'px');
					body.setStyle('padding-left', paperCmd.paperMarginPx.left + 'px');
					// 编辑时纸张设置里面的上下边距是否有效
					if (window.HMConfig && window.HMConfig.editShowPaddingTopBottom) {
						body.setStyle('padding-top', paperCmd.paperMarginPx.top + 'px');
						body.setStyle('padding-bottom', paperCmd.paperMarginPx.bottom + 'px');
					}

					// 设置高度
					paperCmd.logicPaperSize.width = paperOptPx[paperSize].width - paperCmd.paperMarginPx.left - paperCmd.paperMarginPx.right;
					paperCmd.logicPaperSize.height =paperOptPx[paperSize].height - paperCmd.paperMarginPx.top - paperCmd.paperMarginPx.bottom;
					body.setStyle('width', paperCmd.logicPaperSize.width + 'px');

					console.log('已设置页面大小');
					paperCmd.inited = true;
				}

				// 设置打印纸张大小
                var head = editor.document.getHead().$;
                var paperSizeStyle = /\/\*hm-paper-size\*\/.*\/\*hm-paper-size-end\*\//g;
                var newStyleStr = '/*hm-paper-size*/@page{margin:0;size:' + data.paperSize.replace('_portrait', '').replace('_', ' ') + '}/*hm-paper-size-end*/';
                // 如果有预设就替换
                var styleUpdated = false;
                for (var i = 0; i < head.children.length; i++) {
                    if ('STYLE' === head.children[i].tagName) {
                        if (paperSizeStyle.test(head.children[i].innerHTML)) {
                            head.children[i].innerHTML = newStyleStr;
                            styleUpdated = true;
                            break;
                        }
                    }
                }
                // 没有预设就新建
                if (!styleUpdated) {
                    var style = editor.document.$.createElement('style');
                    style.innerHTML = newStyleStr;
                    head.appendChild(style);
                }

				// 如果启用了手动分页，需要更新分页
				if (editor.HMConfig && editor.HMConfig.realtimePageBreak) {
					var pagebreakCmd = CKEDITOR.plugins.pagebreakCmd;
					if (pagebreakCmd) {
						// 触发重新分页，performAutoPaging 中的 paperSize case 会处理分页更新
						setTimeout(function() {
							pagebreakCmd.performAutoPaging(editor, {name: 'paperSize', data: data});
						}, 0);
					}
				}
			}
		});

		// 检查表格是否为第一个元素（在data-hm-widgetid容器下）
		function isTableFirstElement(editor, table) {
			var body = editor.document.getBody();
			
			// 向上查找包含data-hm-widgetid的容器
			var parent = table.getParent();
			var widget = null;
			
			// 向上遍历查找包含data-hm-widgetid的父元素
			while (parent && !parent.equals(body)) {
				if (parent.getAttribute && parent.getAttribute('data-hm-widgetid')) {
					widget = parent;
					break;
				}
				parent = parent.getParent();
			}
			
			// 检查widget容器下的第一个元素节点
			var widgetChildren = widget.getChildren();
			for (var i = 0; i < widgetChildren.count(); i++) {
				var child = widgetChildren.getItem(i);
				
				// 跳过文本节点和注释节点
				if (child.type !== CKEDITOR.NODE_ELEMENT) {
					continue;
				}
				
				// 如果第一个元素是目标表格，返回true
				if (child.equals(table)) {
					return true;
				}
				
				// 如果第一个元素不是表格，返回false
				return false;
			}
			
			return false;
		}
		
		// 检查表格是否为最后一个元素（在data-hm-widgetid容器下）
		function isTableLastElement(editor, table) {
			var body = editor.document.getBody();
			
			// 向上查找包含data-hm-widgetid的容器
			var parent = table.getParent();
			var widget = null;
			
			// 向上遍历查找包含data-hm-widgetid的父元素
			while (parent && !parent.equals(body)) {
				if (parent.getAttribute && parent.getAttribute('data-hm-widgetid')) {
					widget = parent;
					break;
				}
				parent = parent.getParent();
			}
			
			// 检查widget容器下的最后一个元素节点
			var widgetChildren = widget.getChildren();
			// 从后往前遍历
			for (var i = widgetChildren.count() - 1; i >= 0; i--) {
				var child = widgetChildren.getItem(i);
				
				// 跳过文本节点和注释节点
				if (child.type !== CKEDITOR.NODE_ELEMENT) {
					continue;
				}
				
				// 如果最后一个元素是目标表格，返回true
				if (child.equals(table)) {
					return true;
				}
				
				// 如果最后一个元素不是表格，返回false
				return false;
			}
			
			return false;
		}

		function paperHF(commandName){
			var path = editor.elementPath(),
				table = path.contains( 'table', 1 );
			switch(commandName){
				case 'paperHeader_enable':
								
					// 检查是否已经存在其他页眉表格（只允许一个，排除当前表格）
					var body = editor.document.getBody();
					var existingHeaders = body.find('table[_paperheader="true"]');
					for (var i = 0; i < existingHeaders.count(); i++) {
						var existingHeader = existingHeaders.getItem(i);
						// 如果存在其他页眉表格（不是当前表格），则提示
						if (!existingHeader.equals(table)) {
							editor.showNotification('设置页眉失败：页眉只能设置一个表格，请先取消现有的页眉设置。', 'warning', 3000);
							return;
						}
					}
					
					// 检查当前表格是否为第一个元素
					if (!isTableFirstElement(editor, table)) {
						editor.showNotification('设置页眉失败：表格必须是页面中的第一个元素，请将表格移到顶部后再设置。', 'warning', 3000);
						return;
					}
					
					table.setAttribute('_paperheader',true);
					break;
				case 'paperHeader_disable':
					table.removeAttribute('_paperheader');
					break;
				case 'paperFooter_enable':
					// 检查是否已经存在其他页脚表格（只允许一个，排除当前表格）
					var body = editor.document.getBody();
					var existingFooters = body.find('table[_paperfooter="true"]');
					for (var i = 0; i < existingFooters.count(); i++) {
						var existingFooter = existingFooters.getItem(i);
						// 如果存在其他页脚表格（不是当前表格），则提示
						if (!existingFooter.equals(table)) {
							editor.showNotification('设置页脚失败：页脚只能设置一个表格，请先取消现有的页脚设置。', 'warning', 3000);
							return;
						}
					}
					
					// 检查当前表格是否为最后一个元素
					if (!isTableLastElement(editor, table)) {
						editor.showNotification('设置页脚失败：表格必须是页面中的最后一个元素，请将表格移到底部再设置。', 'warning', 3000);
						return;
					}
					
					table.setAttribute('_paperfooter',true);
					break;
				case 'paperFooter_disable':
					table.removeAttribute('_paperfooter');
					break;
			}
		}

		editor.addCommand('paperHeader_enable',{
			exec: function( editor ) {
				paperHF('paperHeader_enable');
			}
		});

		editor.addCommand('paperHeader_disable',{
			exec: function( editor ) {
				paperHF('paperHeader_disable');
			}
		});

		editor.addCommand('paperFooter_enable',{
			exec: function( editor ) {
				paperHF('paperFooter_enable');
			}
		});

		editor.addCommand('paperFooter_disable',{
			exec: function( editor ) {
				paperHF('paperFooter_disable');
			}
		});

		CKEDITOR.dialog.add( 'pagenum', this.path + 'dialogs/pagenum.js' );
		editor.addCommand('paperNum_enable',new CKEDITOR.dialogCommand('pagenum'));

		editor.addCommand('paperNum_disable',{
			exec: function( editor ) {
				var cell = editor.elementPath().contains('td',1);
				$(cell.$).empty();
			}
		});

		editor.addCommand('paperHeader_save',{
			exec: function( editor ) {
				var path = editor.elementPath(),
				table = path.contains( 'table', 1 );
				sessionStorage.setItem('paperHeader',table.getOuterHtml());
			}
		});
		editor.addCommand('paperFooter_save',{
			exec: function( editor ) {
				var path = editor.elementPath(),
				table = path.contains( 'table', 1 );
				sessionStorage.setItem('paperFooter',table.getOuterHtml());
			}
		});

		// 暂时禁用这里设置页眉页脚的右键菜单
		if (editor.contextMenu) {
			editor.addMenuGroup( 'hm' );
			if ( editor.addMenuItems ) {
				editor.addMenuItems( {
					paperHF: {
						label: '页眉页脚',
						group: 'hm',
						order: 2,
						getItems: function() {
							var path = editor.elementPath(),
								table = path.contains( 'table', 1 ),
								cell = path.contains('td',1);

							var items = {};

							if( table.getAttribute('_paperheader') ){
								items["paperHeader_disable"]=  CKEDITOR.TRISTATE_OFF
								items["paperHeader_save"]=  CKEDITOR.TRISTATE_OFF
							}else if( table.getAttribute('_paperfooter') ){
								items["paperFooter_disable"]= CKEDITOR.TRISTATE_OFF
								items["paperFooter_save"]= CKEDITOR.TRISTATE_OFF
							}else{
								items["paperHeader_enable"]= CKEDITOR.TRISTATE_OFF
								items["paperFooter_enable"]= CKEDITOR.TRISTATE_OFF
							}
							var pageNum = cell.find('.page');
							if(pageNum.count( ) == 1){
								items["paperNum_disable"]=  CKEDITOR.TRISTATE_OFF
							}else{
								items["paperNum_enable"]=  CKEDITOR.TRISTATE_OFF
							}
							return items;

						}
					},
					paperHeader_enable: {
						label: '设为页眉',
						group: 'hm',
						command: 'paperHeader_enable',
						order: 1
					},
					paperHeader_disable: {
						label: '取消页眉',
						group: 'hm',
						command: 'paperHeader_disable',
						order: 2
					},
					paperFooter_enable: {
						label: '设为页脚',
						group: 'hm',
						command: 'paperFooter_enable',
						order: 3
					},
					paperFooter_disable: {
						label: '取消页脚',
						group: 'hm',
						command: 'paperFooter_disable',
						order: 4
					},
					paperNum_enable: {
						label: '插入页码',
						group: 'hm',
						command: 'paperNum_enable',
						order: 5
					},
					paperNum_disable: {
						label: '取消页码',
						group: 'hm',
						command: 'paperNum_disable',
						order: 6
					},
					paperHeader_save: {
						label: '暂存页眉',
						group: 'hm',
						command: 'paperHeader_save',
						order: 7
					},
					paperFooter_save: {
						label: '暂存页脚',
						group: 'hm',
						command: 'paperFooter_save',
						order: 8
					}
				} );
			}

			editor.contextMenu.addListener( function( element,selection ,path) {

				var contextItems = {};
				var path = editor.elementPath(),
					table = path.contains( 'table', 1 );
				if( table && !checkCurDomReadOnly(editor) && $(table.$).attr('data-hm-table-type') !== 'list'){

					if( editor.HMConfig.designMode ){
						contextItems['paperHF'] = CKEDITOR.TRISTATE_OFF;
					}

					return contextItems;
				}


			});
		}

		editor.on('beforeCommandExec',function 打印前纸张样式(evt){
			if(evt.data.name == 'print'){
				editor.document.getBody().setStyle('box-shadow','initial');
				var paperMarks = editor.document.find('.paperMark');
				for (var i = 0; i< paperMarks.count(); i++) {
					var paperMark = paperMarks.getItem(i);
					paperMark.setStyle('display','none');
				}
			}
		})

		editor.on('afterCommandExec',function 打印后纸张样式(evt){
			if(evt.data.name == 'print'){
				editor.document.getBody().removeStyle('box-shadow')
				var paperMarks = editor.document.find('.paperMark');
				for (var i = 0; i< paperMarks.count(); i++) {
					var paperMark = paperMarks.getItem(i);
					paperMark.removeStyle('display');
				}
			}
		})

		editor.ui.addButton && editor.ui.addButton( 'Paper', {
			label: '纸张',
			command: 'paper',
			toolbar: 'document'
		});

		CKEDITOR.dialog.add( 'paper', this.path + 'dialogs/paper.js' );
	}
});

// 纸张大小 (px)
CKEDITOR.plugins.paperCmd = {
    inited: false,
	// 页面大小
	logicPaperSize: {
		width: 0,
		height: 0
	},
	// 页边距
	paperMarginPx:{
		top: 0,
		bottom: 0,
		right:0,
		left: 0
	}
};
