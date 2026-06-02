// pages/clients.js
const { useState, useEffect } = React;

window.Module_Clients = function({ firmId, showToast }) {
    // ==========================================
    // 1. States الأساسية
    // ==========================================
    const [activeTab, setActiveTab] = useState('clients'); // 'clients' or 'poas'
    const [refreshTrigger, setRefreshTrigger] = useState(0); 

    // الفلاتر والترقيم
    const [filters, setFilters] = useState({ search: '', startDate: '', endDate: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    // حالة البيانات والجداول
    const [tableData, setTableData] = useState([]);
    const [totalFilteredItems, setTotalFilteredItems] = useState(0);
    const [stats, setStats] = useState({ clientsCount: 0, poasCount: 0, activePoas: 0 });

    // نوافذ الموكلين
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // نوافذ التوكيلات
    const [isPoaModalOpen, setIsPoaModalOpen] = useState(false);
    const [selectedClientForPoa, setSelectedClientForPoa] = useState(null);
    const [clientPoasList, setClientPoasList] = useState([]);
    const [isPoaEditing, setIsPoaEditing] = useState(false);
    const [poaEditId, setPoaEditId] = useState(null);

    // النماذج
    const [formData, setFormData] = useState({
        name: '', phone: '', id_number: '', address: '', notes: '', created_at: new Date().toISOString().split('T')[0]
    });

    const [poaFormData, setPoaFormData] = useState({
        poa_number: '', poa_type: 'عام قضايا', documentation_office: '', poa_date: '', expiry_date: '', notes: ''
    });

    // ==========================================
    // 2. معالجة البيانات (Smart Pagination & Filtering)
    // ==========================================
    const dbTriggerClients = window.useLiveQuery(() => window.db.clients.where('firm_id').equals(firmId).count(), [firmId]);
    const dbTriggerPoas = window.useLiveQuery(() => window.db.power_of_attorneys.count(), []);

    useEffect(() => {
        const fetchAndProcessData = async () => {
            if (!window.db) return;

            let rawClients = await window.db.clients.where('firm_id').equals(firmId).reverse().toArray();
            const clientIds = rawClients.map(c => c.id);
            const clientsMap = new Map(rawClients.map(c => [c.id, c.name]));

            let rawPoas = await window.db.power_of_attorneys.filter(p => clientIds.includes(p.client_id)).reverse().toArray();

            const today = new Date().toISOString().split('T')[0];
            const activePoasCount = rawPoas.filter(p => !p.expiry_date || p.expiry_date >= today).length;
            setStats({ clientsCount: rawClients.length, poasCount: rawPoas.length, activePoas: activePoasCount });

            let filteredData = [];
            
            if (activeTab === 'clients') {
                filteredData = rawClients;
                if (filters.search) {
                    const q = filters.search.toLowerCase();
                    filteredData = filteredData.filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)) || (c.id_number && c.id_number.includes(q)));
                }
                if (filters.startDate) filteredData = filteredData.filter(c => (c.created_at || '2000-01-01').substring(0, 10) >= filters.startDate);
                if (filters.endDate) filteredData = filteredData.filter(c => (c.created_at || '2000-01-01').substring(0, 10) <= filters.endDate);
            } 
            else if (activeTab === 'poas') {
                filteredData = rawPoas.map(p => ({ ...p, client_name: clientsMap.get(p.client_id) || 'موكل محذوف' }));
                if (filters.search) {
                    const q = filters.search.toLowerCase();
                    filteredData = filteredData.filter(p => p.poa_number.includes(q) || p.client_name.toLowerCase().includes(q) || p.poa_type.includes(q));
                }
                if (filters.startDate) filteredData = filteredData.filter(p => (p.poa_date || '2000-01-01') >= filters.startDate);
                if (filters.endDate) filteredData = filteredData.filter(p => (p.poa_date || '2000-01-01') <= filters.endDate);
            }

            setTotalFilteredItems(filteredData.length);

            const startIndex = (currentPage - 1) * itemsPerPage;
            const pagedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

            if (activeTab === 'clients') {
                const enriched = await Promise.all(pagedData.map(async (client) => {
                    const caseCount = await window.db.cases.where('client_id').equals(client.id).count();
                    const poaCount = await window.db.power_of_attorneys.where('client_id').equals(client.id).count();
                    return { ...client, cases_count: caseCount, poas_count: poaCount, safe_date: client.created_at ? client.created_at.substring(0, 10) : '' };
                }));
                setTableData(enriched);
            } else {
                setTableData(pagedData);
            }
        };

        fetchAndProcessData();
    }, [dbTriggerClients, dbTriggerPoas, refreshTrigger, filters, currentPage, activeTab, firmId]);

    const totalPages = Math.ceil(totalFilteredItems / itemsPerPage) || 1;
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);

    // ==========================================
    // 3. معالجات التحكم والتبويبات
    // ==========================================
    const switchTab = (tab) => {
        if (activeTab === tab) return;
        setTableData([]);
        setCurrentPage(1);
        setFilters({ search: '', startDate: '', endDate: '' });
        setActiveTab(tab);
    };

    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
        setCurrentPage(1);
    };

    // ==========================================
    // 4. معالجات الموكلين
    // ==========================================
    const handleFormChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const openAddModal = () => {
        setIsEditing(false); setEditId(null);
        setFormData({ name: '', phone: '', id_number: '', address: '', notes: '', created_at: new Date().toISOString().split('T')[0] });
        setIsModalOpen(true);
    };

    const openEditModal = (client) => {
        setIsEditing(true); setEditId(client.id);
        setFormData({ name: client.name, phone: client.phone || '', id_number: client.id_number || '', address: client.address || '', notes: client.notes || '', created_at: client.safe_date });
        setIsModalOpen(true);
    };

    const handleSaveClient = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const clientData = {
                firm_id: firmId, name: formData.name, phone: formData.phone, id_number: formData.id_number,
                address: formData.address, notes: formData.notes, created_at: new Date(formData.created_at).toISOString()
            };
            if (isEditing) await window.db.clients.update(editId, clientData);
            else await window.db.clients.add(clientData);
            setRefreshTrigger(p => p + 1);
            setIsModalOpen(false);
            showToast(isEditing ? "تم تحديث البيانات" : "تم تسجيل الموكل", "success");
        } catch (error) { showToast("حدث خطأ", "error"); } finally { setIsLoading(false); }
    };

    const handleDeleteClient = async (client) => {
        const checkCaseCount = await window.db.cases.where('client_id').equals(client.id).count();
        if (checkCaseCount > 0) return alert(`⚠️ لا يمكن حذف هذا الموكل لأن لديه (${checkCaseCount}) قضايا.`);
        if (confirm(`هل أنت متأكد من حذف الموكل "${client.name}" نهائياً؟ (سيتم حذف توكيلاته أيضاً)`)) {
            const poas = await window.db.power_of_attorneys.where('client_id').equals(client.id).toArray();
            for(let p of poas) await window.db.power_of_attorneys.delete(p.id);
            await window.db.clients.delete(client.id);
            if (tableData.length === 1 && currentPage > 1) setCurrentPage(p => p - 1);
            setRefreshTrigger(p => p + 1);
            showToast("تم الحذف", "success");
        }
    };

    // ==========================================
    // 5. معالجات التوكيلات
    // ==========================================
    const loadClientPoas = async (clientId) => {
        const poas = await window.db.power_of_attorneys.where('client_id').equals(clientId).reverse().toArray();
        setClientPoasList(poas);
    };

    const openPoaModal = async (client) => {
        let targetClient = client;
        if (!targetClient.name) {
            targetClient = await window.db.clients.get(client.client_id);
        }
        setSelectedClientForPoa(targetClient);
        loadClientPoas(targetClient.id);
        setIsPoaEditing(false); setPoaEditId(null);
        setPoaFormData({ poa_number: '', poa_type: 'عام قضايا', documentation_office: '', poa_date: '', expiry_date: '', notes: '' });
        setIsPoaModalOpen(true);
    };

    const handlePoaFormChange = (e) => setPoaFormData({ ...poaFormData, [e.target.name]: e.target.value });

    const handleEditPoa = (poa) => {
        setIsPoaEditing(true); setPoaEditId(poa.id);
        setPoaFormData({
            poa_number: poa.poa_number || '', poa_type: poa.poa_type || 'عام قضايا',
            documentation_office: poa.documentation_office || '', poa_date: poa.poa_date || '', 
            expiry_date: poa.expiry_date || '', notes: poa.notes || ''
        });
    };

    const handleSavePoa = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const data = {
                client_id: selectedClientForPoa.id, poa_number: poaFormData.poa_number, poa_type: poaFormData.poa_type,
                documentation_office: poaFormData.documentation_office, poa_date: poaFormData.poa_date, 
                expiry_date: poaFormData.expiry_date, notes: poaFormData.notes
            };
            if (isPoaEditing) await window.db.power_of_attorneys.update(poaEditId, data);
            else await window.db.power_of_attorneys.add(data);
            
            setIsPoaEditing(false); setPoaEditId(null);
            setPoaFormData({ poa_number: '', poa_type: 'عام قضايا', documentation_office: '', poa_date: '', expiry_date: '', notes: '' });
            loadClientPoas(selectedClientForPoa.id);
            setRefreshTrigger(p => p + 1);
            showToast("تم الحفظ بنجاح", "success");
        } catch (error) { showToast("حدث خطأ", "error"); } finally { setIsLoading(false); }
    };

    const handleDeletePoa = async (id) => {
        if (confirm("هل أنت متأكد من حذف هذا التوكيل؟")) {
            await window.db.power_of_attorneys.delete(id);
            loadClientPoas(selectedClientForPoa.id);
            setRefreshTrigger(p => p + 1);
            showToast("تم الحذف بنجاح", "success");
        }
    };


    return (
        <div className="space-y-6 animate-view pb-8">
            
            {/* ====== 1. البطاقات الإحصائية ====== */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                <div className="bg-white p-3 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center md:items-start gap-2 md:gap-4 text-center md:text-right">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg md:text-xl shrink-0"><i className="fas fa-users"></i></div>
                    <div><p className="text-[10px] md:text-xs font-bold text-slate-500">إجمالي الموكلين</p><h4 className="text-xl md:text-2xl font-black text-[#1E3A8A]">{stats.clientsCount}</h4></div>
                </div>
                <div className="bg-white p-3 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center md:items-start gap-2 md:gap-4 text-center md:text-right">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg md:text-xl shrink-0"><i className="fas fa-file-signature"></i></div>
                    <div><p className="text-[10px] md:text-xs font-bold text-slate-500">إجمالي التوكيلات</p><h4 className="text-xl md:text-2xl font-black text-[#1E3A8A]">{stats.poasCount}</h4></div>
                </div>
                <div className="col-span-2 md:col-span-1 bg-white p-3 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center md:items-start gap-2 md:gap-4 text-center md:text-right">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg md:text-xl shrink-0"><i className="fas fa-check-circle"></i></div>
                    <div><p className="text-[10px] md:text-xs font-bold text-slate-500">توكيلات سارية (فعالة)</p><h4 className="text-xl md:text-2xl font-black text-[#1E3A8A]">{stats.activePoas}</h4></div>
                </div>
            </div>

            {/* ====== 2. الرأس وشريط الفلترة (محسن للموبايل) ====== */}
            <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm p-4 md:p-5">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4 md:mb-6">
                    
                    {/* التبويبات (عرض كامل على الموبايل) */}
                    <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
                        <button onClick={() => switchTab('clients')} className={`flex-1 md:w-32 py-2.5 md:py-2 text-xs md:text-sm font-black rounded-lg transition-all ${activeTab === 'clients' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>الموكلين</button>
                        <button onClick={() => switchTab('poas')} className={`flex-1 md:w-32 py-2.5 md:py-2 text-xs md:text-sm font-black rounded-lg transition-all ${activeTab === 'poas' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>سجل التوكيلات</button>
                    </div>

                    {/* زر الإضافة */}
                    {activeTab === 'clients' && (
                        <button onClick={openAddModal} className="w-full md:w-auto bg-gradient-to-l from-emerald-600 to-emerald-700 hover:to-emerald-800 text-white px-5 py-3 md:px-6 md:py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 active:scale-95">
                            <i className="fas fa-user-plus"></i> تسجيل موكل
                        </button>
                    )}
                </div>

                {/* شبكة الفلاتر */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
                    <div className="relative">
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                        <input type="text" name="search" value={filters.search} onChange={handleFilterChange} placeholder={activeTab === 'clients' ? "بحث بالاسم، الهاتف..." : "بحث بالموكل، التوكيل..."} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 md:py-3 pr-10 pl-4 text-xs md:text-sm font-bold text-[#1E3A8A] outline-none focus:border-emerald-500 transition" />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] md:text-xs font-bold text-slate-400 whitespace-nowrap">من تاريخ:</span>
                        <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="bg-transparent text-xs md:text-sm font-bold text-[#1E3A8A] outline-none w-full" />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] md:text-xs font-bold text-slate-400 whitespace-nowrap">إلى تاريخ:</span>
                        <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="bg-transparent text-xs md:text-sm font-bold text-[#1E3A8A] outline-none w-full" />
                    </div>
                </div>
            </div>

            {/* ====== 3. عرض البيانات (محسن: بطاقات للموبايل، جدول للديسكتوب) ====== */}
            <div className="bg-transparent md:bg-white rounded-none md:rounded-3xl border-none md:border md:border-slate-200 md:shadow-sm overflow-hidden flex flex-col">
                {tableData.length === 0 ? (
                    <div className="py-16 md:py-20 text-center flex flex-col items-center bg-white rounded-2xl md:rounded-none border border-slate-200 md:border-none shadow-sm md:shadow-none">
                        <div className={`w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-full flex items-center justify-center mb-3 md:mb-4 text-3xl md:text-4xl ${activeTab === 'clients' ? 'text-emerald-200' : 'text-amber-200'}`}><i className={`fas ${activeTab === 'clients' ? 'fa-user-slash' : 'fa-file-excel'}`}></i></div>
                        <h3 className="font-black text-lg md:text-xl text-[#1E3A8A] mb-1">لا توجد سجلات</h3>
                        <p className="text-slate-400 font-bold text-xs md:text-sm">لم يتم العثور على بيانات في هذا القسم.</p>
                    </div>
                ) : (
                    <>
                        {/* 📱 عرض الموبايل (Cards) */}
                        <div className="md:hidden flex flex-col gap-3">
                            {tableData.map((row) => (
                                <div key={row.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 relative overflow-hidden">
                                    
                                    {activeTab === 'clients' ? (
                                        // بطاقة الموكل
                                        <>
                                            <div className="flex items-start gap-3 border-b border-slate-50 pb-3 mb-3">
                                                <div className="w-12 h-12 shrink-0 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-black text-xl border border-emerald-200">{row.name.charAt(0)}</div>
                                                <div className="flex-1 overflow-hidden">
                                                    <h4 className="font-black text-[#1E3A8A] text-base truncate">{row.name}</h4>
                                                    <p className="text-[11px] text-slate-500 font-bold mt-1" dir="ltr"><i className="fas fa-phone-alt mr-1 text-slate-400"></i> {row.phone || 'بدون هاتف'}</p>
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-2 mb-4">
                                                <div className="flex items-center gap-2">
                                                    <i className="far fa-id-card text-slate-400 w-4 text-center text-xs"></i>
                                                    <span className="font-bold text-slate-700 text-xs truncate">{row.id_number || 'غير مسجل'}</span>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <i className="fas fa-map-marker-alt text-slate-400 w-4 text-center text-xs mt-0.5"></i>
                                                    <span className="text-[10px] text-slate-500 font-bold leading-relaxed">{row.address || 'بدون عنوان'}</span>
                                                </div>
                                            </div>

                                            <div className="flex gap-2 mb-4">
                                                <span className={`flex-1 text-[10px] font-black py-1.5 rounded-lg border text-center ${row.cases_count > 0 ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}><i className="fas fa-gavel mr-1"></i> {row.cases_count} قضايا</span>
                                                <span className={`flex-1 text-[10px] font-black py-1.5 rounded-lg border text-center ${row.poas_count > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}><i className="fas fa-file-signature mr-1"></i> {row.poas_count} توكيل</span>
                                            </div>

                                            <div className="flex gap-2 pt-3 border-t border-slate-50">
                                                <button onClick={() => openPoaModal(row)} className="flex-1 bg-amber-50 text-amber-700 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-amber-500 hover:text-white transition-colors"><i className="fas fa-file-signature"></i> التوكيلات</button>
                                                <button onClick={() => openEditModal(row)} className="flex-1 bg-emerald-50 text-emerald-700 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-emerald-500 hover:text-white transition-colors"><i className="fas fa-pen"></i> تعديل</button>
                                                <button onClick={() => handleDeleteClient(row)} className="w-10 bg-rose-50 text-rose-700 py-2 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors"><i className="fas fa-trash text-xs"></i></button>
                                            </div>
                                        </>
                                    ) : (
                                        // بطاقة التوكيل
                                        <>
                                            <div className="flex justify-between items-start border-b border-slate-50 pb-3 mb-3">
                                                <div>
                                                    <div className="font-black text-[#1E3A8A] text-base mb-1">{row.poa_number}</div>
                                                    <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded">{row.poa_type}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-2 mb-4">
                                                <div className="flex items-center gap-2">
                                                    <i className="fas fa-user text-slate-400 w-4 text-center text-xs"></i>
                                                    <span className="font-bold text-slate-700 text-xs truncate">{row.client_name}</span>
                                                </div>
                                                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                    <div className="text-[10px] font-bold text-slate-600"><span className="text-slate-400 block mb-0.5">إصدار</span> {row.poa_date || '---'}</div>
                                                    <div className="text-[10px] font-bold text-rose-600 text-left"><span className="text-slate-400 block mb-0.5">انتهاء</span> {row.expiry_date || '---'}</div>
                                                </div>
                                            </div>

                                            <div className="pt-2 border-t border-slate-50">
                                                <button onClick={() => openPoaModal(row)} className="w-full bg-slate-100 text-[#1E3A8A] py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#1E3A8A] hover:text-white transition-colors"><i className="fas fa-cog"></i> إدارة التوكيل</button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* 💻 عرض الديسكتوب (Table) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-right">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider font-bold">
                                        {activeTab === 'clients' ? (
                                            <>
                                                <th className="px-6 py-4">بيانات الموكل</th>
                                                <th className="px-6 py-4">الرقم القومي / العنوان</th>
                                                <th className="px-6 py-4 text-center">الملفات</th>
                                                <th className="px-6 py-4 text-center">إجراءات</th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="px-6 py-4">رقم ونوع التوكيل</th>
                                                <th className="px-6 py-4">الموكل</th>
                                                <th className="px-6 py-4">التواريخ (إصدار / انتهاء)</th>
                                                <th className="px-6 py-4 text-center">إجراءات</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {tableData.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50/50 transition-colors group">
                                            {activeTab === 'clients' ? (
                                                <>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-black text-lg border border-emerald-200">{row.name.charAt(0)}</div>
                                                            <div>
                                                                <div className="font-black text-[#1E3A8A] text-base">{row.name}</div>
                                                                <div className="text-[11px] text-slate-500 font-bold mt-1" dir="ltr"><i className="fas fa-phone-alt mr-1 text-slate-400"></i> {row.phone || 'بدون هاتف'}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-bold text-slate-700 text-sm mb-1"><i className="far fa-id-card text-slate-400 ml-1"></i> {row.id_number || 'غير مسجل'}</div>
                                                        <div className="text-[10px] text-slate-500 font-bold truncate max-w-[150px]"><i className="fas fa-map-marker-alt text-slate-400 ml-1"></i> {row.address || 'بدون عنوان'}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col items-center gap-1.5">
                                                            <span className={`w-24 text-[10px] font-black px-2 py-1 rounded-lg border text-center ${row.cases_count > 0 ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}><i className="fas fa-gavel mr-1"></i> {row.cases_count} قضايا</span>
                                                            <span className={`w-24 text-[10px] font-black px-2 py-1 rounded-lg border text-center ${row.poas_count > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}><i className="fas fa-file-signature mr-1"></i> {row.poas_count} توكيل</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button onClick={() => openPoaModal(row)} className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-500 hover:text-white transition-all" title="إدارة التوكيلات"><i className="fas fa-file-signature text-xs"></i></button>
                                                            <button onClick={() => openEditModal(row)} className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all" title="تعديل"><i className="fas fa-pen text-xs"></i></button>
                                                            <button onClick={() => handleDeleteClient(row)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all" title="حذف"><i className="fas fa-trash text-xs"></i></button>
                                                        </div>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-6 py-4">
                                                        <div className="font-black text-[#1E3A8A] text-sm mb-1">{row.poa_number}</div>
                                                        <div className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded inline-block">{row.poa_type}</div>
                                                    </td>
                                                    <td className="px-6 py-4 font-bold text-slate-700">{row.client_name}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-xs font-bold text-slate-600 mb-1"><span className="text-slate-400">إصدار:</span> {row.poa_date || 'غير محدد'}</div>
                                                        <div className="text-xs font-bold text-rose-600"><span className="text-slate-400">انتهاء:</span> {row.expiry_date || 'غير محدد'}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <button onClick={() => openPoaModal(row)} className="bg-slate-100 hover:bg-[#1E3A8A] hover:text-white text-slate-600 font-bold text-xs px-3 py-1.5 rounded-lg transition-colors">إدارة وعرض</button>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
                
                {/* Pagination */}
                {totalFilteredItems > itemsPerPage && (
                    <div className="p-3 md:p-4 mt-3 md:mt-0 border border-slate-200 md:border-t md:border-x-0 md:border-b-0 bg-white md:bg-slate-50 flex items-center justify-between rounded-2xl md:rounded-none shadow-sm md:shadow-none">
                        <p className="text-[11px] md:text-xs font-bold text-slate-500">صفحة {currentPage} من {totalPages}</p>
                        <div className="flex gap-1">
                            <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-emerald-600 hover:text-white disabled:opacity-50"><i className="fas fa-chevron-right text-[10px] md:text-xs"></i></button>
                            <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-emerald-600 hover:text-white disabled:opacity-50"><i className="fas fa-chevron-left text-[10px] md:text-xs"></i></button>
                        </div>
                    </div>
                )}
            </div>

            {/* ====== الإعلان الترويجي ====== */}
            <div className="relative mt-8 bg-gradient-to-l from-emerald-900 to-[#0F172A] rounded-2xl md:rounded-3xl p-5 md:p-8 text-white shadow-xl overflow-hidden border border-emerald-800/50">
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-[#25D366] rounded-full blur-[70px] opacity-20 pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-right">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-4 w-full">
                        <div className="w-14 h-14 shrink-0 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center text-3xl border border-white/20 text-[#25D366]">
                            <i className="fab fa-whatsapp"></i>
                        </div>
                        <div>
                            <h4 className="font-black text-lg md:text-xl mb-1 text-white">تواصل مع موكليك بضغطة زر!</h4>
                            <p className="text-slate-300 text-xs md:text-sm font-semibold max-w-lg leading-relaxed">
                                هل ترغب في إبلاغ موكليك بمواعيد الجلسات أو القرارات فوراً؟ <br/> <strong className="text-emerald-400">النسخة السحابية</strong> تتيح لك إرسال رسائل واتساب تلقائية ومنسقة لكل موكل.
                            </p>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-auto shrink-0">
                        <a href="https://wa.me/201211934816" target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebd5b] text-white px-6 py-3.5 rounded-xl font-black text-sm transition-all active:scale-95 shadow-lg shadow-green-900/30">
                            <i className="fas fa-rocket text-lg"></i>
                            ترقية للنسخة السحابية
                        </a>
                    </div>
                </div>
            </div>

            {/* ====== 4. Modal الموكلين ====== */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-3 sm:p-4 animate-view">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[95vh] md:max-h-[90vh]">
                        <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 p-4 md:p-6 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3 text-white">
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-white/20 rounded-xl flex items-center justify-center text-base md:text-xl backdrop-blur-md"><i className={`fas ${isEditing ? 'fa-pen' : 'fa-user-plus'}`}></i></div>
                                <h3 className="text-base md:text-xl font-black tracking-wide">{isEditing ? 'تعديل بيانات الموكل' : 'تسجيل موكل جديد'}</h3>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-white/50 hover:text-white transition text-lg bg-white/5 w-8 h-8 rounded-full flex items-center justify-center"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar flex-1">
                            <form onSubmit={handleSaveClient} className="space-y-4 md:space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">اسم الموكل رباعي <span className="text-rose-500">*</span></label>
                                        <input type="text" name="name" value={formData.name} onChange={handleFormChange} required className="w-full p-3 md:p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-emerald-500 font-bold text-xs md:text-sm text-[#1E3A8A]" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">تاريخ التسجيل <span className="text-rose-500">*</span></label>
                                        <input type="date" name="created_at" value={formData.created_at} onChange={handleFormChange} required className="w-full p-3 md:p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-emerald-500 font-bold text-xs md:text-sm text-[#1E3A8A]" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">رقم الهاتف</label>
                                        <input type="tel" name="phone" value={formData.phone} onChange={handleFormChange} dir="ltr" className="w-full p-3 md:p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-emerald-500 font-bold text-xs md:text-sm text-[#1E3A8A] text-left" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">الرقم القومي</label>
                                        <input type="text" name="id_number" value={formData.id_number} onChange={handleFormChange} dir="ltr" className="w-full p-3 md:p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-emerald-500 font-bold text-xs md:text-sm text-[#1E3A8A] text-left" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">العنوان</label>
                                    <input type="text" name="address" value={formData.address} onChange={handleFormChange} className="w-full p-3 md:p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-emerald-500 font-bold text-xs md:text-sm text-[#1E3A8A]" />
                                </div>
                                <div>
                                    <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">ملاحظات</label>
                                    <textarea name="notes" value={formData.notes} onChange={handleFormChange} rows="2" className="w-full p-3 md:p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-emerald-500 font-bold text-xs md:text-sm text-[#1E3A8A] resize-none"></textarea>
                                </div>
                                <div className="pt-2">
                                    <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 md:py-4 rounded-xl shadow-lg transition-all text-sm md:text-base">{isLoading ? 'جاري الحفظ...' : 'حفظ البيانات'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ====== 5. Modal التوكيلات المدمج (محسن ومقسوم بشكل سليم للموبايل) ====== */}
            {isPoaModalOpen && selectedClientForPoa && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-3 sm:p-4 animate-view">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-100 flex flex-col max-h-[95vh] md:max-h-[90vh]">
                        
                        <div className="bg-gradient-to-r from-amber-500 to-yellow-600 p-4 md:p-6 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3 text-white">
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-white/20 rounded-xl flex items-center justify-center text-base md:text-xl backdrop-blur-md"><i className="fas fa-file-signature"></i></div>
                                <div><h3 className="text-base md:text-xl font-black tracking-wide">توكيلات الموكل</h3><p className="text-[10px] md:text-xs font-bold text-amber-100 mt-0.5 truncate max-w-[200px] sm:max-w-xs">{selectedClientForPoa.name}</p></div>
                            </div>
                            <button onClick={() => setIsPoaModalOpen(false)} className="text-white/50 hover:text-white transition text-lg bg-white/5 w-8 h-8 rounded-full flex items-center justify-center"><i className="fas fa-times"></i></button>
                        </div>

                        <div className="flex flex-col md:flex-row flex-1 overflow-y-auto md:overflow-hidden">
                            {/* الفورم (يظهر بالأعلى في الموبايل) */}
                            <div className="w-full md:w-1/3 bg-slate-50 md:border-l border-b md:border-b-0 border-slate-200 p-4 md:p-6 shrink-0 md:overflow-y-auto">
                                <h4 className="font-black text-[#1E3A8A] mb-3 md:mb-4 text-xs md:text-sm"><i className={`fas ${isPoaEditing ? 'fa-pen text-blue-500' : 'fa-plus text-amber-500'} mr-1`}></i> {isPoaEditing ? 'تعديل توكيل' : 'إضافة توكيل جديد'}</h4>
                                <form onSubmit={handleSavePoa} className="space-y-3 md:space-y-4">
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">رقم التوكيل <span className="text-rose-500">*</span></label>
                                        <input type="text" name="poa_number" value={poaFormData.poa_number} onChange={handlePoaFormChange} required className="w-full p-2.5 md:p-3 rounded-xl border-2 border-slate-200 outline-none focus:border-amber-500 font-bold text-xs md:text-sm text-[#1E3A8A]" />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">النوع <span className="text-rose-500">*</span></label>
                                        <select name="poa_type" value={poaFormData.poa_type} onChange={handlePoaFormChange} required className="w-full p-2.5 md:p-3 rounded-xl border-2 border-slate-200 outline-none focus:border-amber-500 font-bold text-xs md:text-sm text-[#1E3A8A]">
                                            <option value="عام قضايا">عام قضايا</option>
                                            <option value="خاص">خاص</option>
                                            <option value="عام رسمي">عام رسمي</option>
                                            <option value="تأسيس شركات">تأسيس شركات</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">مكتب التوثيق <span className="text-rose-500">*</span></label>
                                        <input type="text" name="documentation_office" value={poaFormData.documentation_office} onChange={handlePoaFormChange} required className="w-full p-2.5 md:p-3 rounded-xl border-2 border-slate-200 outline-none focus:border-amber-500 font-bold text-xs md:text-sm text-[#1E3A8A]" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">تاريخ الإصدار</label>
                                            <input type="date" name="poa_date" value={poaFormData.poa_date} onChange={handlePoaFormChange} className="w-full p-2.5 md:p-3 rounded-xl border-2 border-slate-200 outline-none focus:border-amber-500 font-bold text-[10px] md:text-xs text-[#1E3A8A] px-1" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">تاريخ الانتهاء</label>
                                            <input type="date" name="expiry_date" value={poaFormData.expiry_date} onChange={handlePoaFormChange} className="w-full p-2.5 md:p-3 rounded-xl border-2 border-slate-200 outline-none focus:border-amber-500 font-bold text-[10px] md:text-xs text-rose-600 px-1" />
                                        </div>
                                    </div>
                                    <div className="pt-2 flex gap-2">
                                        <button type="submit" disabled={isLoading} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-black py-2.5 md:py-3 rounded-xl text-xs md:text-sm transition-all">{isLoading ? 'جاري...' : (isPoaEditing ? 'حفظ التعديل' : 'إضافة التوكيل')}</button>
                                        {isPoaEditing && <button type="button" onClick={() => {setIsPoaEditing(false); setPoaFormData({poa_number: '', poa_type: 'عام قضايا', documentation_office: '', poa_date: '', expiry_date: '', notes: ''});}} className="px-4 bg-slate-200 text-slate-700 font-black rounded-xl text-xs md:text-sm">إلغاء</button>}
                                    </div>
                                </form>
                            </div>

                            {/* القائمة (تظهر بالأسفل في الموبايل مع إمكانية التمرير بداخلها) */}
                            <div className="w-full md:w-2/3 p-4 md:p-6 bg-white md:overflow-y-auto">
                                <h4 className="font-black text-slate-500 mb-3 md:mb-4 text-xs md:text-sm border-b border-slate-100 pb-2">التوكيلات المسجلة ({clientPoasList.length})</h4>
                                {clientPoasList.length === 0 ? (
                                    <div className="py-8 md:py-10 text-center flex flex-col items-center opacity-50"><i className="fas fa-folder-open text-3xl md:text-4xl text-slate-300 mb-2 md:mb-3"></i><p className="text-slate-500 font-bold text-xs md:text-sm">لا توجد توكيلات مسجلة.</p></div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-2 md:gap-3">
                                        {clientPoasList.map(poa => (
                                            <div key={poa.id} className="border-2 border-slate-100 rounded-xl p-3 md:p-4 hover:border-amber-200 hover:bg-amber-50/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-all">
                                                <div className="w-full sm:w-auto">
                                                    <div className="flex items-center gap-2 mb-1.5"><span className="bg-amber-100 text-amber-700 text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded">{poa.poa_type}</span><span className="font-black text-[#1E3A8A] text-sm md:text-base">{poa.poa_number}</span></div>
                                                    <div className="text-[10px] md:text-xs font-bold text-slate-500 flex flex-col sm:flex-row flex-wrap gap-1 sm:gap-3">
                                                        <span><i className="fas fa-building text-slate-400 w-3"></i> {poa.documentation_office}</span>
                                                        <div className="flex gap-3 mt-1 sm:mt-0">
                                                            {poa.poa_date && <span><i className="fas fa-calendar-plus text-emerald-400"></i> إصدار: {poa.poa_date}</span>}
                                                            {poa.expiry_date && <span><i className="fas fa-calendar-times text-rose-400"></i> انتهاء: {poa.expiry_date}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 self-end sm:self-auto w-full sm:w-auto justify-end border-t sm:border-0 border-slate-100 pt-2 sm:pt-0">
                                                    <button onClick={() => handleEditPoa(poa)} className="w-8 h-8 rounded-lg bg-slate-50 text-blue-600 hover:bg-blue-500 hover:text-white flex items-center justify-center transition-colors"><i className="fas fa-pen text-xs"></i></button>
                                                    <button onClick={() => handleDeletePoa(poa.id)} className="w-8 h-8 rounded-lg bg-slate-50 text-rose-600 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors"><i className="fas fa-trash text-xs"></i></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};