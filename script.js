// script.js
let db;
let currentCustomerId = null;
let currentTab = 'sale'; 

const request = indexedDB.open("MishuManagementDB", 2);

request.onupgradeneeded = (event) => {
    db = event.target.result;
    if (!db.objectStoreNames.contains("customers")) {
        db.createObjectStore("customers", { keyPath: "id", autoIncrement: true });
    }
    if (!db.objectStoreNames.contains("mishuData")) {
        const mishuStore = db.createObjectStore("mishuData", { keyPath: "id", autoIncrement: true });
        mishuStore.createIndex("customerId", "customerId", { unique: false });
    }
};

request.onsuccess = (event) => {
    db = event.target.result;
    const now = new Date();
    const monthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0');
    document.getElementById('view-month').value = monthStr;
    renderCustomerList();
};

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    renderMishuList();
}

function renderCustomerList() {
    const store = db.transaction("customers", "readonly").objectStore("customers");
    store.getAll().onsuccess = (e) => {
        const list = document.getElementById('customer-list');
        list.innerHTML = '';
        e.target.result.forEach(customer => {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.innerHTML = `
                <button class="customer-btn" onclick="showDetail(${customer.id}, '${customer.name}')">${customer.name}</button>
                <button class="delete-btn" onclick="deleteCustomer(${customer.id})">削除</button>
            `;
            list.appendChild(div);
        });
    };
}

function addCustomer() {
    const input = document.getElementById('new-customer-name');
    const name = input.value.trim();
    if (!name) return;
    const tx = db.transaction("customers", "readwrite");
    tx.objectStore("customers").add({ name });
    tx.oncomplete = () => { input.value = ''; renderCustomerList(); };
}

function deleteCustomer(id) {
    if (!confirm("本当に削除してもいいですか？\n全データが消去されます。")) return;
    const tx = db.transaction(["customers", "mishuData"], "readwrite");
    tx.objectStore("customers").delete(id);
    const index = tx.objectStore("mishuData").index("customerId");
    index.openCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = renderCustomerList;
}

function showDetail(id, name) {
    currentCustomerId = id;
    document.getElementById('index-page').classList.remove('active');
    document.getElementById('detail-page').classList.add('active');
    document.getElementById('detail-title').innerText = name + " 様";
    renderMishuList();
}

function showIndex() {
    currentCustomerId = null;
    document.getElementById('detail-page').classList.remove('active');
    document.getElementById('index-page').classList.add('active');
}

function addMishuData() {
    const date = document.getElementById('mishu-date').value;
    const type = document.getElementById('mishu-type').value;
    const amount = parseInt(document.getElementById('mishu-amount').value);
    
    if (!date || isNaN(amount)) return alert("正しく入力してください");

    const tx = db.transaction("mishuData", "readwrite");
    tx.objectStore("mishuData").add({
        customerId: currentCustomerId,
        date: date,
        type: type, 
        amount: amount,
        checked: (type === 'collect') // 回収として登録した場合は最初からチェックありにする
    });
    tx.oncomplete = () => {
        document.getElementById('mishu-amount').value = '';
        renderMishuList();
    };
}

function renderMishuList() {
    const selectedMonth = document.getElementById('view-month').value;
    const tx = db.transaction("mishuData", "readonly");
    const index = tx.objectStore("mishuData").index("customerId");
    const req = index.getAll(IDBKeyRange.only(currentCustomerId));

    req.onsuccess = () => {
        const tbody = document.getElementById('mishu-table-body');
        tbody.innerHTML = '';
        
        let totalSale = 0;
        let totalCollect = 0;

        req.result.forEach(data => {
            // 集計ロジック:
            // 1. 種別がsale(売上)なら売上累計に加算
            // 2. 種別がcollect(回収)、または種別がsaleで「チェックあり(回収済み)」なら回収累計に加算
            if (data.type === 'sale') {
                totalSale += data.amount;
                if (data.checked) totalCollect += data.amount;
            } else if (data.type === 'collect') {
                totalCollect += data.amount;
            }

            // 表示フィルタリング
            // 未収タブ：sale かつ チェックなし
            // 回収済みタブ：collect 全て、または sale かつ チェックあり
            const isForSaleTab = (data.type === 'sale' && !data.checked);
            const isForCollectTab = (data.type === 'collect' || (data.type === 'sale' && data.checked));

            if (data.date.startsWith(selectedMonth)) {
                if ((currentTab === 'sale' && isForSaleTab) || (currentTab === 'collect' && isForCollectTab)) {
                    const tr = document.createElement('tr');
                    if (data.checked) tr.className = 'row-checked';
                    tr.innerHTML = `
                        <td><input type="checkbox" ${data.checked ? 'checked' : ''} onchange="toggleCheck(${data.id}, this.checked)"></td>
                        <td>${data.date}</td>
                        <td>¥${data.amount.toLocaleString()}</td>
                        <td><button class="delete-btn" onclick="deleteMishuRecord(${data.id})">削除</button></td>
                    `;
                    tbody.appendChild(tr);
                }
            }
        });

        const balance = totalSale - totalCollect;
        document.getElementById('total-sale').innerText = `¥${totalSale.toLocaleString()}`;
        document.getElementById('total-collect').innerText = `¥${totalCollect.toLocaleString()}`;
        document.getElementById('total-balance').innerText = `¥${(balance < 0 ? 0 : balance).toLocaleString()}`;
    };
}

function toggleCheck(id, isChecked) {
    const tx = db.transaction("mishuData", "readwrite");
    const store = tx.objectStore("mishuData");
    store.get(id).onsuccess = (e) => {
        const data = e.target.result;
        data.checked = isChecked;
        store.put(data);
    };
    tx.oncomplete = renderMishuList;
}

function deleteMishuRecord(id) {
    if (!confirm("このデータを削除しますか？")) return;
    const tx = db.transaction("mishuData", "readwrite");
    tx.objectStore("mishuData").delete(id);
    tx.oncomplete = renderMishuList;
}