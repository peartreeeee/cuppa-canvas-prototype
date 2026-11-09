const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..','dist');
function runtime(){
 const elements=new Map(),requests=[],copied=[],messages=[];
 const element=()=>({value:'',checked:false,hidden:false,disabled:false,textContent:'',innerHTML:'',isConnected:true,style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},focus(){},blur(){},select(){},close(){this.open=false},querySelector(){return element()},querySelectorAll(){return []}});
 const get=selector=>{if(!elements.has(selector))elements.set(selector,element());return elements.get(selector)};
 const context=vm.createContext({console,URL,Intl,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem(){}},document:{querySelector:get,querySelectorAll:()=>[]},navigator:{clipboard:{writeText:async text=>{copied.push(text)}}},window:{open:(...args)=>requests.push(args)}});
 for(const file of ['resources.js','claims.js','search-materials.js','tags.js','ai-conversations.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');vm.runInContext(app.slice(0,app.indexOf("$('#query').onfocus=")),context);
 context.get=get;context.messages=messages;
 vm.runInContext(`state.aiThreads=[];save=()=>{};renderSide=()=>{};renderCards=()=>{};refreshGraph=()=>{};locate=()=>{};notify=text=>messages.push(text);panel=()=>{};sync=()=>{};closeSources=()=>{};`,context);
 return {context,get,requests,copied,messages,run:code=>vm.runInContext(code,context)}
}
const plain=value=>JSON.parse(JSON.stringify(value));
function form(env,values={}){
 const defaults={'#ai-import-provider':'chatgpt','#ai-import-thread':'','#ai-import-thread-title':'产品讨论','#ai-import-url':'','#ai-import-text':'第一段\n\n第二段','#ai-import-question':'原问题','#ai-import-summary':'','#ai-import-tags':'#产品策略, AI, AI','input[name="ai-save-mode"]:checked':'excerpt'};
 for(const [selector,value] of Object.entries({...defaults,...values}))env.get(selector).value=value;
 env.get('#ai-include-question').checked=true;env.run('aiImportSelection=new Set([0,1]);aiImportEditing=null;aiImportCommitted=false;');
 return ()=>env.run('saveAiExcerptImport({preventDefault(){}})')
}
test('parser keeps blank lines inside fenced code and preserves Markdown tables',()=>{
 const e=runtime(),input='开头\n\n```js\nconst x = 1;\n\nconsole.log(x);\n```\n\n| 方案 | 成本 |\n| --- | --- |\n| A | 低 |';e.context.input=input;
 const blocks=plain(e.run('parseAiExcerptBlocks(input)'));assert.deepEqual(blocks.map(b=>b.type),['text','code','table']);assert(blocks[1].text.includes('\n\nconsole.log'));
 e.context.block=blocks[1];assert(e.run('aiBlockMarkup(block)').includes('console.log(x)'));
});
test('only selected paragraphs are stored, with an omission marker for gaps',()=>{
 const e=runtime();const data=plain(e.run("buildAiExcerptData({provider:'chatgpt',text:'已选开头\\n\\n秘密的未选内容\\n\\n已选结论',indices:[2,0,2,99],tags:'AI,#AI,产品',question:'问题'})"));
 assert.equal(data.blocks.length,2);assert(data.blocks[1].gapBefore);assert(!JSON.stringify(data).includes('秘密'));assert(data.originalText.includes('［中间内容未选入］'));assert.deepEqual(data.tags,['AI','产品']);
});
test('full-save preserves the exact pasted text and ignores paragraph exclusions',()=>{
 const e=runtime();e.context.raw='第一段\r\n\r\n第二段\n';const data=plain(e.run("buildAiExcerptData({provider:'deepseek',text:raw,mode:'full',indices:[]})"));assert.equal(data.originalText,e.context.raw);assert.equal(data.blocks.length,2);assert.equal(data.mode,'full');
});
test('empty selection, oversized content and unsafe source links fail before saving',()=>{
 const e=runtime();assert.throws(()=>e.run("buildAiExcerptData({text:'内容',indices:[]})"),/至少选择/);assert.throws(()=>e.run("buildAiExcerptData({text:'内容',indices:[0],url:'javascript:alert(1)'})"),/链接/);assert.throws(()=>e.run("buildAiExcerptData({text:'字'.repeat(50001),indices:[0]})"),/5 万字/);assert.equal(e.run('state.cards.length'),0);
});
test('rendering escapes active HTML and never creates script or image elements',()=>{
 const e=runtime();e.context.raw='<script>alert(1)</script><img src=x onerror=alert(1)>\n[危险](javascript:alert(1))';const markup=e.run("aiBlockMarkup({type:'text',text:raw})");assert(!markup.includes('<script>'));assert(!markup.includes('<img'));assert(!markup.includes('href="javascript:'));assert(markup.includes('&lt;script&gt;'));
});
test('unknown providers remain unknown instead of inheriting object properties',()=>{
 const e=runtime();assert.equal(e.run("aiProvider('constructor').name"),'来源未填写');assert.equal(e.run("buildAiExcerptData({provider:'toString',text:'内容',indices:[0]}).provider"),'unknown');
});
test('external AI target applies only in personal mode and yields to image search',()=>{
 const e=runtime();e.run("draft().aiProvider='chatgpt'");assert.equal(e.run('activeAiProvider()'),'chatgpt');e.run("draft().refs=[{id:'x',kind:'image'}]");assert.equal(e.run('activeAiProvider()'),null);e.run("state.mode='agent';draft().aiProvider='chatgpt'");assert.equal(e.run('activeAiProvider()'),null);
});
test('choosing another AI clears image material but retains textual references',()=>{
 const e=runtime();e.run("draft().refs=[{kind:'image',id:'i'},{kind:'text',id:'t'}];chooseAiProvider('doubao')");assert.equal(e.run('draft().aiProvider'),'doubao');assert.equal(e.run('draft().refs.length'),1);assert.equal(e.run('draft().refs[0].id'),'t');
});
test('launch copies text and opens only the official site URL without a prompt query',async()=>{
 const e=runtime();e.run("draft().aiProvider='chatgpt';draft().text='保密的提问';launchAiConversation()");await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(e.copied,['保密的提问']);assert.equal(e.requests[0][0],'https://chatgpt.com/');assert(!JSON.stringify(e.requests).includes('保密'));assert(e.get('#ai-copy-status').textContent.includes('已复制'));
});
test('clipboard rejection leaves a visible manual-copy fallback',async()=>{
 const e=runtime();e.context.navigator.clipboard.writeText=()=>Promise.reject(Error('denied'));e.run("draft().aiProvider='deepseek';draft().text='提问';launchAiConversation()");await new Promise(resolve=>setImmediate(resolve));assert(e.get('#ai-copy-status').textContent.includes('未能自动复制'));assert.equal(e.requests[0][0],'https://chat.deepseek.com/');
});
test('one capture creates one manually added resource and preserves the original question',()=>{
 const e=runtime(),save=form(e);save();const cards=plain(e.run('state.cards'));assert.equal(cards.length,1);assert.equal(cards[0].type,'source');assert.equal(cards[0].subtype,'ai-excerpt');assert.equal(cards[0].addedBy,'personal');assert.equal(cards[0].ai.question,'原问题');assert.equal(cards[0].ai.originalText,'第一段\n\n第二段');assert.equal(e.run('state.aiImportDraft'),null);
});
test('repeated captures from the same source URL share a thread, not a card',()=>{
 const e=runtime();form(e,{'#ai-import-url':'https://chatgpt.com/c/demo#first'})();form(e,{'#ai-import-url':'https://chatgpt.com/c/demo#second','#ai-import-text':'第三段\n\n第四段'})();assert.equal(e.run('state.cards.length'),2);assert.equal(e.run('state.aiThreads.length'),1);assert.equal(e.run('state.cards[0].ai.threadId===state.cards[1].ai.threadId'),true);
});
test('a different conversation URL cannot silently join the selected old thread',()=>{
 const e=runtime();form(e,{'#ai-import-url':'https://chatgpt.com/c/one'})();const id=e.run('state.aiThreads[0].id');form(e,{'#ai-import-thread':id,'#ai-import-url':'https://chatgpt.com/c/two'})();assert.equal(e.run('state.aiThreads.length'),2);assert.equal(e.run('state.cards[0].ai.threadId===state.cards[1].ai.threadId'),false);
});
test('an explicit conversation without a URL supports multiple related captures',()=>{
 const e=runtime();form(e)();const id=e.run('state.aiThreads[0].id');form(e,{'#ai-import-thread':id}) ();assert.equal(e.run('state.aiThreads.length'),1);assert.equal(e.run('state.cards.length'),2);
});
test('editing metadata keeps saved original text, blocks and capture time unchanged',()=>{
 const e=runtime();form(e)();const before=plain(e.run('state.cards[0].ai'));e.run('aiImportEditing=state.cards[0]');e.get('#ai-import-summary').value='我修改的摘要';e.get('#ai-import-text').value='不应覆盖原文';e.get('#ai-import-thread').value=before.threadId;e.run('saveAiExcerptImport({preventDefault(){}})');const after=plain(e.run('state.cards[0].ai'));assert.equal(after.originalText,before.originalText);assert.deepEqual(after.blocks,before.blocks);assert.equal(after.capturedAt,before.capturedAt);assert.equal(e.run('state.cards[0].title'),'我修改的摘要');assert.equal(e.run('state.cards.length'),1);
});
test('AI resources use a local three-state reader while normal website cards retain their iframe path',()=>{
 const e=runtime();form(e)();e.run('state.cards[0].expanded=true');const html=e.run('resourceMarkup(state.cards[0])');assert(html.includes('ai-excerpt-low'));assert(html.includes('ai-excerpt-normal'));assert(html.includes('ai-excerpt-reader'));assert(html.includes('data-ai-siblings'));assert(!html.includes('<iframe'));assert(!html.includes('browser-viewport'));assert(e.run("resourceMarkup({id:'web',type:'source',title:'网页',url:'https://example.com',text:'',x:0,y:0})").includes('browser-viewport'));
});
test('unchecked question is not stored or added to the searchable text',()=>{
 const e=runtime();const save=form(e);e.get('#ai-include-question').checked=false;save();assert.equal(e.run('state.cards[0].ai.question'),'');assert(!e.run('state.cards[0].text').includes('原问题'));
});
test('committed captures dismiss the launch panel and draft selections remain explicit',()=>{
 const e=runtime();form(e)();assert.equal(e.get('#result-panel').hidden,true);form(e);e.run('aiImportSelection=new Set([1])');const draft=plain(e.run('readAiImportDraft()'));assert.deepEqual(draft.indices,[1]);assert.equal(draft.question,'原问题');
});
test('rich clipboard code keeps internal blank lines and ignores active elements',()=>{
 const e=runtime();const text=value=>({nodeType:3,nodeValue:value,textContent:value});const node=(tag,children)=>({nodeType:1,tagName:tag.toUpperCase(),childNodes:children,children:children.filter(n=>n.nodeType===1),get textContent(){return children.map(n=>n.textContent).join('')},getAttribute(){return ''}});
 const pre=node('pre',[text('one\n\n\nfour')]),script=node('script',[text('alert(1)')]);e.context.document.createElement=()=>({content:{childNodes:[pre,script]},set innerHTML(value){}});const result=e.run("aiClipboardText('fallback','<pre>code</pre><script>alert(1)</script>')");assert(result.includes('one\n\n\nfour'));assert(!result.includes('alert(1)'));
});
test('escaped pipes in a Markdown table stay within their original cell',()=>{
 const e=runtime();e.context.block={type:'table',text:'| A | B |\n| --- | --- |\n| x\\|y | z |'};const html=e.run('aiBlockMarkup(block)');assert.equal((html.match(/<td>/g)||[]).length,2);assert(html.includes('x|y'));
});
