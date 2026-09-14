export function importBatches(posts) {
  const batches=[];
  let batch=[],bytes=0,offset=0;
  for(const post of posts){
    const size=new TextEncoder().encode(JSON.stringify(post)).length+1;
    if(size>8*1024*1024) throw new Error('One post exceeds the request limit. Split its content before importing.');
    if(batch.length===250 || (batch.length && bytes+size>8*1024*1024)){
      batches.push({posts:batch,offset});offset+=batch.length;batch=[];bytes=0;
    }
    batch.push(post);bytes+=size;
  }
  if(batch.length)batches.push({posts:batch,offset});
  return batches;
}
