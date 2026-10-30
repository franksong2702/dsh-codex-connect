const picker=document.querySelector('#task'),surface=document.querySelector('#surface');
for(const task of tasks){const option=document.createElement('option');option.value=task.id;option.textContent=task.id;picker.append(option)}
let state=initialState(picker.value);
function apply(method,params){state=transition(state,{method,params});render()}
function button(text,callback){const element=document.createElement('button');element.textContent=text;element.onclick=callback;return element}
function render(){
 surface.replaceChildren();document.querySelector('#goal').textContent=tasks.find(task=>task.id===state.taskId).goal;
 if(state.taskId==='locate'){surface.className='grid';for(const target of observation(state).targets)surface.append(button(target,()=>apply('click',{target})))}
 else surface.className='';
 if(state.taskId==='form'){
  for(const target of ['Name','Code']){const label=document.createElement('label');label.textContent=target;const input=document.createElement('input');input.value=state[target.toLowerCase()];input.autocomplete='off';input.oninput=()=>{state=transition(state,{method:'setValue',params:{target,value:input.value}});summary()};label.append(input);surface.append(label)}
  surface.append(button('Submit',()=>apply('click',{target:'Submit'})));
 }
 if(state.taskId==='scroll'){
  const list=document.createElement('div');list.id='list';list.setAttribute('aria-label','Scrollable item list');
  for(let index=0;index<24;index++){const target=`Item ${index+1}`;const row=button(target,()=>apply('click',{target}));row.className='row';list.append(row)}
  surface.append(list);list.scrollTop=state.offset*40;
  list.onscroll=()=>{state={...state,offset:Math.min(18,Math.floor(list.scrollTop/40))};summary()};
 }
 if(state.taskId==='steps')surface.append(button(observation(state).targets[0],()=>apply('click',{target:observation(state).targets[0]})));
 if(state.taskId==='recover'){
  if(!state.retry){const error=document.createElement('p');error.setAttribute('role','alert');error.textContent='Synthetic validation error. Retry to continue.';surface.append(error)}
  surface.append(button(observation(state).targets[0],()=>apply('click',{target:observation(state).targets[0]})));
 }
 summary();
}
function summary(){document.querySelector('#result').textContent=`${verify(state)?'PASS':'Not complete'} — wrong actions: ${state.wrongActions}`;document.querySelector('#state').textContent=JSON.stringify(state,null,2)}
function reset(){document.querySelector('details').open=false;state=initialState(picker.value);render()}
picker.onchange=reset;document.querySelector('#reset').onclick=reset;render();
