import faiss from 'faiss-node';
const { IndexFlatL2, Index, IndexFlatIP, MetricType } = faiss;
const dimension = 2;
const index = new IndexFlatL2(dimension);

console.log(index.getDimension()); // 2
console.log(index.isTrained()); // true
console.log(index.ntotal()); // 0

// inserting data into index.
index.add([1, 0]);
index.add([1, 2]);
index.add([1, 3]);
index.add([1, 1]);

console.log(index.ntotal()); // 4

const k = 4;
const results = index.search([1, 0], k);
console.log(results.labels); // [ 0, 3, 1, 2 ]
console.log(results.distances); // [ 0, 1, 4, 9 ]

// Save index
const fname = 'faiss.index';
index.write(fname);