(function(){
function wire(f){f.addEventListener('submit',async function(e){e.preventDefault();var b=f.querySelector('[data-btn]'),m=f.querySelector('[data-msg]'),label=b.textContent;b.disabled=true;b.textContent='Sending...';
try{var d=Object.fromEntries(new FormData(f));var r=await fetch('https://api.web3forms.com/submit',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(d)});var j=await r.json();if(!j.success)throw 0;try{fetch('/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({},d,{access_key:undefined})),keepalive:true})}catch(_){}
f.reset();b.textContent='Sent!';m.textContent="Got it. We'll text you shortly. Need it sooner? Call (317) 637-8807."}
catch(_){b.disabled=false;b.textContent=label;m.textContent='Something went wrong. Please call or text (317) 637-8807.'}})}
document.querySelectorAll('form[data-quote]').forEach(wire)})();
