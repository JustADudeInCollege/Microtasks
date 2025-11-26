import{d as Ke,a as Le}from"../chunks/DW6SgpQ5.js";import{b as xe,a9 as Be,d as Ve,a7 as He,m as We,h as Ue,e as Ge,aj as ae,al as se,as as ze,am as Je}from"../chunks/BRRr3SwI.js";import{o as ce}from"../chunks/cvNx14Ps.js";import"../chunks/BtzQYpAV.js";import{i as Ye}from"../chunks/B_RzDYrx.js";import{s as Qe,a as Xe}from"../chunks/EolnTgZ4.js";import{r as k,_ as v,C as I,h as j,E as ue,i as $,F as Ze,j as C,k as et,l as q,v as tt,m as nt,n as ot,o as de,a as fe,p as G,q as it,e as rt,t as at,w as st,x as ct,d as z,y as J,z as Y}from"../chunks/CUjvs8Ev.js";import{w as le}from"../chunks/C17eDrHM.js";function ut(e,t,...n){var o=e,i=He,r;xe(()=>{i!==(i=t())&&(r&&(We(r),r=null),r=Ve(()=>i(o,...n)))},Be),Ue&&(o=Ge)}const dt=!1,Xn=Object.freeze(Object.defineProperty({__proto__:null,prerender:dt},Symbol.toStringTag,{value:"Module"})),pe="@firebase/installations",K="0.6.13";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ge=1e4,we=`w:${K}`,he="FIS_v2",ft="https://firebaseinstallations.googleapis.com/v1",lt=60*60*1e3,pt="installations",gt="Installations";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const wt={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"not-registered":"Firebase Installation is not registered.","installation-not-found":"Firebase Installation not found.","request-failed":'{$requestName} request failed with error "{$serverCode} {$serverStatus}: {$serverMessage}"',"app-offline":"Could not process request. Application offline.","delete-pending-registration":"Can't delete installation while there is a pending registration request."},m=new ue(pt,gt,wt);function me(e){return e instanceof Ze&&e.code.includes("request-failed")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function be({projectId:e}){return`${ft}/projects/${e}/installations`}function ye(e){return{token:e.token,requestStatus:2,expiresIn:mt(e.expiresIn),creationTime:Date.now()}}async function Te(e,t){const o=(await t.json()).error;return m.create("request-failed",{requestName:e,serverCode:o.code,serverMessage:o.message,serverStatus:o.status})}function ke({apiKey:e}){return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e})}function ht(e,{refreshToken:t}){const n=ke(e);return n.append("Authorization",bt(t)),n}async function ve(e){const t=await e();return t.status>=500&&t.status<600?e():t}function mt(e){return Number(e.replace("s","000"))}function bt(e){return`${he} ${e}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function yt({appConfig:e,heartbeatServiceProvider:t},{fid:n}){const o=be(e),i=ke(e),r=t.getImmediate({optional:!0});if(r){const d=await r.getHeartbeatsHeader();d&&i.append("x-firebase-client",d)}const a={fid:n,authVersion:he,appId:e.appId,sdkVersion:we},c={method:"POST",headers:i,body:JSON.stringify(a)},l=await ve(()=>fetch(o,c));if(l.ok){const d=await l.json();return{fid:d.fid||n,registrationStatus:2,refreshToken:d.refreshToken,authToken:ye(d.authToken)}}else throw await Te("Create Installation",l)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Ie(e){return new Promise(t=>{setTimeout(t,e)})}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Tt(e){return btoa(String.fromCharCode(...e)).replace(/\+/g,"-").replace(/\//g,"_")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const kt=/^[cdef][\w-]{21}$/,R="";function vt(){try{const e=new Uint8Array(17);(self.crypto||self.msCrypto).getRandomValues(e),e[0]=112+e[0]%16;const n=It(e);return kt.test(n)?n:R}catch{return R}}function It(e){return Tt(e).substr(0,22)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function _(e){return`${e.appName}!${e.appId}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Se=new Map;function Ae(e,t){const n=_(e);_e(n,t),St(n,t)}function _e(e,t){const n=Se.get(e);if(n)for(const o of n)o(t)}function St(e,t){const n=At();n&&n.postMessage({key:e,fid:t}),_t()}let h=null;function At(){return!h&&"BroadcastChannel"in self&&(h=new BroadcastChannel("[Firebase] FID Change"),h.onmessage=e=>{_e(e.data.key,e.data.fid)}),h}function _t(){Se.size===0&&h&&(h.close(),h=null)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Mt="firebase-installations-database",Et=1,b="firebase-installations-store";let N=null;function L(){return N||(N=$(Mt,Et,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(b)}}})),N}async function S(e,t){const n=_(e),i=(await L()).transaction(b,"readwrite"),r=i.objectStore(b),a=await r.get(n);return await r.put(t,n),await i.done,(!a||a.fid!==t.fid)&&Ae(e,t.fid),t}async function Me(e){const t=_(e),o=(await L()).transaction(b,"readwrite");await o.objectStore(b).delete(t),await o.done}async function M(e,t){const n=_(e),i=(await L()).transaction(b,"readwrite"),r=i.objectStore(b),a=await r.get(n),c=t(a);return c===void 0?await r.delete(n):await r.put(c,n),await i.done,c&&(!a||a.fid!==c.fid)&&Ae(e,c.fid),c}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function x(e){let t;const n=await M(e.appConfig,o=>{const i=Ct(o),r=Nt(e,i);return t=r.registrationPromise,r.installationEntry});return n.fid===R?{installationEntry:await t}:{installationEntry:n,registrationPromise:t}}function Ct(e){const t=e||{fid:vt(),registrationStatus:0};return Ee(t)}function Nt(e,t){if(t.registrationStatus===0){if(!navigator.onLine){const i=Promise.reject(m.create("app-offline"));return{installationEntry:t,registrationPromise:i}}const n={fid:t.fid,registrationStatus:1,registrationTime:Date.now()},o=Ot(e,n);return{installationEntry:n,registrationPromise:o}}else return t.registrationStatus===1?{installationEntry:t,registrationPromise:Dt(e)}:{installationEntry:t}}async function Ot(e,t){try{const n=await yt(e,t);return S(e.appConfig,n)}catch(n){throw me(n)&&n.customData.serverCode===409?await Me(e.appConfig):await S(e.appConfig,{fid:t.fid,registrationStatus:0}),n}}async function Dt(e){let t=await Q(e.appConfig);for(;t.registrationStatus===1;)await Ie(100),t=await Q(e.appConfig);if(t.registrationStatus===0){const{installationEntry:n,registrationPromise:o}=await x(e);return o||n}return t}function Q(e){return M(e,t=>{if(!t)throw m.create("installation-not-found");return Ee(t)})}function Ee(e){return Ft(e)?{fid:e.fid,registrationStatus:0}:e}function Ft(e){return e.registrationStatus===1&&e.registrationTime+ge<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Pt({appConfig:e,heartbeatServiceProvider:t},n){const o=Rt(e,n),i=ht(e,n),r=t.getImmediate({optional:!0});if(r){const d=await r.getHeartbeatsHeader();d&&i.append("x-firebase-client",d)}const a={installation:{sdkVersion:we,appId:e.appId}},c={method:"POST",headers:i,body:JSON.stringify(a)},l=await ve(()=>fetch(o,c));if(l.ok){const d=await l.json();return ye(d)}else throw await Te("Generate Auth Token",l)}function Rt(e,{fid:t}){return`${be(e)}/${t}/authTokens:generate`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function B(e,t=!1){let n;const o=await M(e.appConfig,r=>{if(!Ce(r))throw m.create("not-registered");const a=r.authToken;if(!t&&qt(a))return r;if(a.requestStatus===1)return n=jt(e,t),r;{if(!navigator.onLine)throw m.create("app-offline");const c=Lt(r);return n=$t(e,c),c}});return n?await n:o.authToken}async function jt(e,t){let n=await X(e.appConfig);for(;n.authToken.requestStatus===1;)await Ie(100),n=await X(e.appConfig);const o=n.authToken;return o.requestStatus===0?B(e,t):o}function X(e){return M(e,t=>{if(!Ce(t))throw m.create("not-registered");const n=t.authToken;return xt(n)?Object.assign(Object.assign({},t),{authToken:{requestStatus:0}}):t})}async function $t(e,t){try{const n=await Pt(e,t),o=Object.assign(Object.assign({},t),{authToken:n});return await S(e.appConfig,o),n}catch(n){if(me(n)&&(n.customData.serverCode===401||n.customData.serverCode===404))await Me(e.appConfig);else{const o=Object.assign(Object.assign({},t),{authToken:{requestStatus:0}});await S(e.appConfig,o)}throw n}}function Ce(e){return e!==void 0&&e.registrationStatus===2}function qt(e){return e.requestStatus===2&&!Kt(e)}function Kt(e){const t=Date.now();return t<e.creationTime||e.creationTime+e.expiresIn<t+lt}function Lt(e){const t={requestStatus:1,requestTime:Date.now()};return Object.assign(Object.assign({},e),{authToken:t})}function xt(e){return e.requestStatus===1&&e.requestTime+ge<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Bt(e){const t=e,{installationEntry:n,registrationPromise:o}=await x(t);return o?o.catch(console.error):B(t).catch(console.error),n.fid}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Vt(e,t=!1){const n=e;return await Ht(n),(await B(n,t)).token}async function Ht(e){const{registrationPromise:t}=await x(e);t&&await t}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Wt(e){if(!e||!e.options)throw O("App Configuration");if(!e.name)throw O("App Name");const t=["projectId","apiKey","appId"];for(const n of t)if(!e.options[n])throw O(n);return{appName:e.name,projectId:e.options.projectId,apiKey:e.options.apiKey,appId:e.options.appId}}function O(e){return m.create("missing-app-config-values",{valueName:e})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ne="installations",Ut="installations-internal",Gt=e=>{const t=e.getProvider("app").getImmediate(),n=Wt(t),o=j(t,"heartbeat");return{app:t,appConfig:n,heartbeatServiceProvider:o,_delete:()=>Promise.resolve()}},zt=e=>{const t=e.getProvider("app").getImmediate(),n=j(t,Ne).getImmediate();return{getId:()=>Bt(n),getToken:i=>Vt(n,i)}};function Jt(){v(new I(Ne,Gt,"PUBLIC")),v(new I(Ut,zt,"PRIVATE"))}Jt();k(pe,K);k(pe,K,"esm2017");/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Yt="/firebase-messaging-sw.js",Qt="/firebase-cloud-messaging-push-scope",Oe="BDOU99-h67HcA6JeFXHbSNMu7e2yNNu3RzoMj8TM4W88jITfq7ZmPvIM1Iv-4_l2LxQcYwhqby2xGpWwzjfAnG4",Xt="https://fcmregistrations.googleapis.com/v1",De="google.c.a.c_id",Zt="google.c.a.c_l",en="google.c.a.ts",tn="google.c.a.e",Z=1e4;var ee;(function(e){e[e.DATA_MESSAGE=1]="DATA_MESSAGE",e[e.DISPLAY_NOTIFICATION=3]="DISPLAY_NOTIFICATION"})(ee||(ee={}));/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */var y;(function(e){e.PUSH_RECEIVED="push-received",e.NOTIFICATION_CLICKED="notification-clicked"})(y||(y={}));/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function w(e){const t=new Uint8Array(e);return btoa(String.fromCharCode(...t)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}function nn(e){const t="=".repeat((4-e.length%4)%4),n=(e+t).replace(/\-/g,"+").replace(/_/g,"/"),o=atob(n),i=new Uint8Array(o.length);for(let r=0;r<o.length;++r)i[r]=o.charCodeAt(r);return i}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const D="fcm_token_details_db",on=5,te="fcm_token_object_Store";async function rn(e){if("databases"in indexedDB&&!(await indexedDB.databases()).map(r=>r.name).includes(D))return null;let t=null;return(await $(D,on,{upgrade:async(o,i,r,a)=>{var c;if(i<2||!o.objectStoreNames.contains(te))return;const l=a.objectStore(te),d=await l.index("fcmSenderId").get(e);if(await l.clear(),!!d){if(i===2){const s=d;if(!s.auth||!s.p256dh||!s.endpoint)return;t={token:s.fcmToken,createTime:(c=s.createTime)!==null&&c!==void 0?c:Date.now(),subscriptionOptions:{auth:s.auth,p256dh:s.p256dh,endpoint:s.endpoint,swScope:s.swScope,vapidKey:typeof s.vapidKey=="string"?s.vapidKey:w(s.vapidKey)}}}else if(i===3){const s=d;t={token:s.fcmToken,createTime:s.createTime,subscriptionOptions:{auth:w(s.auth),p256dh:w(s.p256dh),endpoint:s.endpoint,swScope:s.swScope,vapidKey:w(s.vapidKey)}}}else if(i===4){const s=d;t={token:s.fcmToken,createTime:s.createTime,subscriptionOptions:{auth:w(s.auth),p256dh:w(s.p256dh),endpoint:s.endpoint,swScope:s.swScope,vapidKey:w(s.vapidKey)}}}}}})).close(),await C(D),await C("fcm_vapid_details_db"),await C("undefined"),an(t)?t:null}function an(e){if(!e||!e.subscriptionOptions)return!1;const{subscriptionOptions:t}=e;return typeof e.createTime=="number"&&e.createTime>0&&typeof e.token=="string"&&e.token.length>0&&typeof t.auth=="string"&&t.auth.length>0&&typeof t.p256dh=="string"&&t.p256dh.length>0&&typeof t.endpoint=="string"&&t.endpoint.length>0&&typeof t.swScope=="string"&&t.swScope.length>0&&typeof t.vapidKey=="string"&&t.vapidKey.length>0}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const sn="firebase-messaging-database",cn=1,T="firebase-messaging-store";let F=null;function Fe(){return F||(F=$(sn,cn,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(T)}}})),F}async function un(e){const t=Pe(e),o=await(await Fe()).transaction(T).objectStore(T).get(t);if(o)return o;{const i=await rn(e.appConfig.senderId);if(i)return await V(e,i),i}}async function V(e,t){const n=Pe(e),i=(await Fe()).transaction(T,"readwrite");return await i.objectStore(T).put(t,n),await i.done,t}function Pe({appConfig:e}){return e.appId}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const dn={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"only-available-in-window":"This method is available in a Window context.","only-available-in-sw":"This method is available in a service worker context.","permission-default":"The notification permission was not granted and dismissed instead.","permission-blocked":"The notification permission was not granted and blocked instead.","unsupported-browser":"This browser doesn't support the API's required to use the Firebase SDK.","indexed-db-unsupported":"This browser doesn't support indexedDb.open() (ex. Safari iFrame, Firefox Private Browsing, etc)","failed-service-worker-registration":"We are unable to register the default service worker. {$browserErrorMessage}","token-subscribe-failed":"A problem occurred while subscribing the user to FCM: {$errorInfo}","token-subscribe-no-token":"FCM returned no token when subscribing the user to push.","token-unsubscribe-failed":"A problem occurred while unsubscribing the user from FCM: {$errorInfo}","token-update-failed":"A problem occurred while updating the user from FCM: {$errorInfo}","token-update-no-token":"FCM returned no token when updating the user to push.","use-sw-after-get-token":"The useServiceWorker() method may only be called once and must be called before calling getToken() to ensure your service worker is used.","invalid-sw-registration":"The input to useServiceWorker() must be a ServiceWorkerRegistration.","invalid-bg-handler":"The input to setBackgroundMessageHandler() must be a function.","invalid-vapid-key":"The public VAPID key must be a string.","use-vapid-key-after-get-token":"The usePublicVapidKey() method may only be called once and must be called before calling getToken() to ensure your VAPID key is used."},g=new ue("messaging","Messaging",dn);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function fn(e,t){const n=await W(e),o=Re(t),i={method:"POST",headers:n,body:JSON.stringify(o)};let r;try{r=await(await fetch(H(e.appConfig),i)).json()}catch(a){throw g.create("token-subscribe-failed",{errorInfo:a==null?void 0:a.toString()})}if(r.error){const a=r.error.message;throw g.create("token-subscribe-failed",{errorInfo:a})}if(!r.token)throw g.create("token-subscribe-no-token");return r.token}async function ln(e,t){const n=await W(e),o=Re(t.subscriptionOptions),i={method:"PATCH",headers:n,body:JSON.stringify(o)};let r;try{r=await(await fetch(`${H(e.appConfig)}/${t.token}`,i)).json()}catch(a){throw g.create("token-update-failed",{errorInfo:a==null?void 0:a.toString()})}if(r.error){const a=r.error.message;throw g.create("token-update-failed",{errorInfo:a})}if(!r.token)throw g.create("token-update-no-token");return r.token}async function pn(e,t){const o={method:"DELETE",headers:await W(e)};try{const r=await(await fetch(`${H(e.appConfig)}/${t}`,o)).json();if(r.error){const a=r.error.message;throw g.create("token-unsubscribe-failed",{errorInfo:a})}}catch(i){throw g.create("token-unsubscribe-failed",{errorInfo:i==null?void 0:i.toString()})}}function H({projectId:e}){return`${Xt}/projects/${e}/registrations`}async function W({appConfig:e,installations:t}){const n=await t.getToken();return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e.apiKey,"x-goog-firebase-installations-auth":`FIS ${n}`})}function Re({p256dh:e,auth:t,endpoint:n,vapidKey:o}){const i={web:{endpoint:n,auth:t,p256dh:e}};return o!==Oe&&(i.web.applicationPubKey=o),i}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const gn=7*24*60*60*1e3;async function wn(e){const t=await mn(e.swRegistration,e.vapidKey),n={vapidKey:e.vapidKey,swScope:e.swRegistration.scope,endpoint:t.endpoint,auth:w(t.getKey("auth")),p256dh:w(t.getKey("p256dh"))},o=await un(e.firebaseDependencies);if(o){if(bn(o.subscriptionOptions,n))return Date.now()>=o.createTime+gn?hn(e,{token:o.token,createTime:Date.now(),subscriptionOptions:n}):o.token;try{await pn(e.firebaseDependencies,o.token)}catch(i){console.warn(i)}return ne(e.firebaseDependencies,n)}else return ne(e.firebaseDependencies,n)}async function hn(e,t){try{const n=await ln(e.firebaseDependencies,t),o=Object.assign(Object.assign({},t),{token:n,createTime:Date.now()});return await V(e.firebaseDependencies,o),n}catch(n){throw n}}async function ne(e,t){const o={token:await fn(e,t),createTime:Date.now(),subscriptionOptions:t};return await V(e,o),o.token}async function mn(e,t){const n=await e.pushManager.getSubscription();return n||e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:nn(t)})}function bn(e,t){const n=t.vapidKey===e.vapidKey,o=t.endpoint===e.endpoint,i=t.auth===e.auth,r=t.p256dh===e.p256dh;return n&&o&&i&&r}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function oe(e){const t={from:e.from,collapseKey:e.collapse_key,messageId:e.fcmMessageId};return yn(t,e),Tn(t,e),kn(t,e),t}function yn(e,t){if(!t.notification)return;e.notification={};const n=t.notification.title;n&&(e.notification.title=n);const o=t.notification.body;o&&(e.notification.body=o);const i=t.notification.image;i&&(e.notification.image=i);const r=t.notification.icon;r&&(e.notification.icon=r)}function Tn(e,t){t.data&&(e.data=t.data)}function kn(e,t){var n,o,i,r,a;if(!t.fcmOptions&&!(!((n=t.notification)===null||n===void 0)&&n.click_action))return;e.fcmOptions={};const c=(i=(o=t.fcmOptions)===null||o===void 0?void 0:o.link)!==null&&i!==void 0?i:(r=t.notification)===null||r===void 0?void 0:r.click_action;c&&(e.fcmOptions.link=c);const l=(a=t.fcmOptions)===null||a===void 0?void 0:a.analytics_label;l&&(e.fcmOptions.analyticsLabel=l)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function vn(e){return typeof e=="object"&&!!e&&De in e}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function In(e){if(!e||!e.options)throw P("App Configuration Object");if(!e.name)throw P("App Name");const t=["projectId","apiKey","appId","messagingSenderId"],{options:n}=e;for(const o of t)if(!n[o])throw P(o);return{appName:e.name,projectId:n.projectId,apiKey:n.apiKey,appId:n.appId,senderId:n.messagingSenderId}}function P(e){return g.create("missing-app-config-values",{valueName:e})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Sn{constructor(t,n,o){this.deliveryMetricsExportedToBigQueryEnabled=!1,this.onBackgroundMessageHandler=null,this.onMessageHandler=null,this.logEvents=[],this.isLogServiceStarted=!1;const i=In(t);this.firebaseDependencies={app:t,appConfig:i,installations:n,analyticsProvider:o}}_delete(){return Promise.resolve()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function An(e){try{e.swRegistration=await navigator.serviceWorker.register(Yt,{scope:Qt}),e.swRegistration.update().catch(()=>{}),await _n(e.swRegistration)}catch(t){throw g.create("failed-service-worker-registration",{browserErrorMessage:t==null?void 0:t.message})}}async function _n(e){return new Promise((t,n)=>{const o=setTimeout(()=>n(new Error(`Service worker not registered after ${Z} ms`)),Z),i=e.installing||e.waiting;e.active?(clearTimeout(o),t()):i?i.onstatechange=r=>{var a;((a=r.target)===null||a===void 0?void 0:a.state)==="activated"&&(i.onstatechange=null,clearTimeout(o),t())}:(clearTimeout(o),n(new Error("No incoming service worker found.")))})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Mn(e,t){if(!t&&!e.swRegistration&&await An(e),!(!t&&e.swRegistration)){if(!(t instanceof ServiceWorkerRegistration))throw g.create("invalid-sw-registration");e.swRegistration=t}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function En(e,t){t?e.vapidKey=t:e.vapidKey||(e.vapidKey=Oe)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function je(e,t){if(!navigator)throw g.create("only-available-in-window");if(Notification.permission==="default"&&await Notification.requestPermission(),Notification.permission!=="granted")throw g.create("permission-blocked");return await En(e,t==null?void 0:t.vapidKey),await Mn(e,t==null?void 0:t.serviceWorkerRegistration),wn(e)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Cn(e,t,n){const o=Nn(t);(await e.firebaseDependencies.analyticsProvider.get()).logEvent(o,{message_id:n[De],message_name:n[Zt],message_time:n[en],message_device_time:Math.floor(Date.now()/1e3)})}function Nn(e){switch(e){case y.NOTIFICATION_CLICKED:return"notification_open";case y.PUSH_RECEIVED:return"notification_foreground";default:throw new Error}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function On(e,t){const n=t.data;if(!n.isFirebaseMessaging)return;e.onMessageHandler&&n.messageType===y.PUSH_RECEIVED&&(typeof e.onMessageHandler=="function"?e.onMessageHandler(oe(n)):e.onMessageHandler.next(oe(n)));const o=n.data;vn(o)&&o[tn]==="1"&&await Cn(e,n.messageType,o)}const ie="@firebase/messaging",re="0.12.17";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Dn=e=>{const t=new Sn(e.getProvider("app").getImmediate(),e.getProvider("installations-internal").getImmediate(),e.getProvider("analytics-internal"));return navigator.serviceWorker.addEventListener("message",n=>On(t,n)),t},Fn=e=>{const t=e.getProvider("messaging").getImmediate();return{getToken:o=>je(t,o)}};function Pn(){v(new I("messaging",Dn,"PUBLIC")),v(new I("messaging-internal",Fn,"PRIVATE")),k(ie,re),k(ie,re,"esm2017")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Rn(){try{await tt()}catch{return!1}return typeof window<"u"&&nt()&&ot()&&"serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window&&"fetch"in window&&ServiceWorkerRegistration.prototype.hasOwnProperty("showNotification")&&PushSubscription.prototype.hasOwnProperty("getKey")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function jn(e,t){if(!navigator)throw g.create("only-available-in-window");return e.onMessageHandler=t,()=>{e.onMessageHandler=null}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function $n(e=et()){return Rn().then(t=>{if(!t)throw g.create("unsupported-browser")},t=>{throw g.create("indexed-db-unsupported")}),j(q(e),"messaging").getImmediate()}async function qn(e,t){return e=q(e),je(e,t)}function Kn(e,t){return e=q(e),jn(e,t)}Pn();const Ln=null,A=le(Ln);de(fe,e=>{e?(A.set({uid:e.uid,email:e.email,displayName:e.displayName}),console.log("[AuthStore] User signed in:",e.uid)):(A.set(null),console.log("[AuthStore] User signed out."))});const xn=le(!0);{const e=de(fe,()=>{xn.set(!1),e()})}function Bn(e,t){ae(t,!1);const[n,o]=Qe(),i=()=>Xe(A,"$userStore",n);let r=null,a=null,c=null;async function l(){if(!(!G||typeof window>"u"))try{r=$n(G),console.log("[FCM Manager] Firebase Messaging initialized."),Kn(r,u=>{var f,p;console.log("[FCM Manager] Message received in foreground: ",u),alert(`New Notification: ${(f=u.notification)==null?void 0:f.title}
${(p=u.notification)==null?void 0:p.body}`)}),await d()}catch(u){console.error("[FCM Manager] Error initializing messaging:",u)}}async function d(){if(!(!r||typeof Notification>"u"))try{if(c=Notification.permission,c==="granted")console.log("[FCM Manager] Notification permission already granted."),await s();else if(c==="default"){console.log("[FCM Manager] Requesting notification permission...");const u=await Notification.requestPermission();c=u,u==="granted"?(console.log("[FCM Manager] Notification permission granted."),await s()):console.warn("[FCM Manager] Notification permission denied.")}else console.warn("[FCM Manager] Notification permission is",c)}catch(u){console.error("[FCM Manager] Error requesting permission or getting token:",u)}}async function s(){var u;if(!r||!((u=i())!=null&&u.uid)){console.log("[FCM Manager] Messaging instance or user UID not available for token.");return}try{const p=await qn(r,{vapidKey:"BOXzGswD4I9fUeh8L-_t0Q7_e_PrT7-_NjfwAPw-_PE-4TuQG_pHBqMUdQMV3TvsOYxL9iMZt2PWpRiIXc4zx3w"});p?(a=p,console.log("[FCM Manager] FCM Token:",p),await $e(p,i().uid)):console.warn("[FCM Manager] No registration token available. Request permission to generate one.")}catch(f){console.error("[FCM Manager] An error occurred while retrieving token. ",f),String(f).includes("MISSING_GSW_IN_MANIFEST")&&console.error("[FCM Manager] Error: Service worker not found. Ensure 'firebase-messaging-sw.js' is in your static folder and accessible, and that your Firebase config in it is correct.")}}async function $e(u,f){if(!f){console.warn("[FCM Manager] No user ID, cannot store token.");return}try{const p=it(rt,"users",f,"fcmTokens"),qe=at(p,st("token","==",u)),U=await ct(qe);if(U.empty){const E=z(p);await J(E,{token:u,createdAt:Y(),userAgent:navigator.userAgent}),console.log("[FCM Manager] FCM token stored on server for user:",f)}else console.log("[FCM Manager] FCM token already exists on server for this user."),U.forEach(async E=>{await J(z(p,E.id),{updatedAt:Y()},{merge:!0})})}catch(p){console.error("[FCM Manager] Error storing FCM token on server:",p)}}ce(()=>{const u=A.subscribe(f=>{f!=null&&f.uid?(console.log("[FCM Manager] User identified, attempting to initialize messaging."),l(),u&&u()):console.log("[FCM Manager] No user identified yet from store.")});return setTimeout(()=>{var f,p;!((f=i())!=null&&f.uid)&&Notification.permission==="default"||(p=i())!=null&&p.uid&&!r&&(console.log("[FCM Manager] Fallback: User identified, attempting to initialize messaging."),l())},1500),()=>{u&&u()}}),Ye(),se(),o()}var Vn=Ke("<!> <!>",1);function Zn(e,t){ae(t,!0),ce(()=>{const r=localStorage.getItem("theme"),a=window.matchMedia("(prefers-color-scheme: dark)").matches;r==="dark"||!r&&a?document.body.classList.add("dark"):document.body.classList.remove("dark")});var n=Vn(),o=ze(n);Bn(o,{});var i=Je(o,2);ut(i,()=>t.children),Le(e,n),se()}export{Zn as component,Xn as universal};
