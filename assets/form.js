(function(){var f=document.getElementById('quoteForm');if(!f)return;
f.addEventListener('submit',async function(e){e.preventDefault();var b=document.getElementById('formBtn'),m=document.getElementById('formMsg');b.disabled=true;b.textContent='Sending...';
try{var r=await fetch('https://api.web3forms.com/submit',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(f)))});var j=await r.json();if(!j.success)throw 0;f.reset();b.textContent='Sent!';m.textContent="Got it. We'll text you shortly. Need it sooner? Call (317) 625-2831."}
catch(_){b.disabled=false;b.textContent='Send My Quote Request';m.textContent='Something went wrong. Please call or text (317) 625-2831.'}})})();
