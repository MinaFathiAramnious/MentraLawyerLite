// pages/documents.js
const { useState, useEffect } = React;

window.Module_Documents = function({ firmId, showToast }) {
    // ==========================================
    // 1. States الأساسية
    // ==========================================
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [viewMemo, setViewMemo] = useState(null); 
    const [isLoading, setIsLoading] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false); // حالة تحميل للطباعة
    
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0); 
    
    const [filters, setFilters] = useState({ search: '', startDate: '', endDate: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 3; 

    const [tableData, setTableData] = useState([]);
    const [totalFilteredItems, setTotalFilteredItems] = useState(0);

    const [formData, setFormData] = useState({
        case_id: '', title: '', content: '', created_at: new Date().toISOString().split('T')[0]
    });

    const [caseSearch, setCaseSearch] = useState({ term: '', results: [], isSearching: false, display: null });

    // ==========================================
    // 2. معالجة البيانات (Performance Fix & Pagination)
    // ==========================================
    const dbTrigger = window.useLiveQuery(() => window.db.case_documents.count(), []);

    useEffect(() => {
        const fetchAndProcessData = async () => {
            if (!window.db) return;

            let allDocs = await window.db.case_documents.reverse().toArray();
            let filtered = allDocs.filter(d => d.doc_type === 'memo');

            if (filters.search) {
                const q = filters.search.toLowerCase();
                filtered = filtered.filter(d => d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q));
            }
            if (filters.startDate) {
                filtered = filtered.filter(d => d.created_at.substring(0, 10) >= filters.startDate);
            }
            if (filters.endDate) {
                filtered = filtered.filter(d => d.created_at.substring(0, 10) <= filters.endDate);
            }

            setTotalFilteredItems(filtered.length);

            const startIndex = (currentPage - 1) * itemsPerPage;
            const pagedDocs = filtered.slice(startIndex, startIndex + itemsPerPage);

            const enrichedDocs = await Promise.all(pagedDocs.map(async (doc) => {
                const caseObj = await window.db.cases.get(doc.case_id);
                if (caseObj && caseObj.firm_id === firmId) {
                    return { ...doc, case_number: caseObj.case_number, safe_date: doc.created_at.substring(0, 10) };
                }
                return null;
            }));

            setTableData(enrichedDocs.filter(d => d !== null));
        };

        fetchAndProcessData();
    }, [dbTrigger, filters, currentPage, firmId, refreshTrigger]); 

    const totalPages = Math.ceil(totalFilteredItems / itemsPerPage) || 1;
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);

    // ==========================================
    // 3. بحث القضية الذكي (Smart Search)
    // ==========================================
    const handleSearchCase = async (e) => {
        const term = e.target.value;
        setCaseSearch(prev => ({ ...prev, term }));
        if (!term.trim()) return setCaseSearch(prev => ({ ...prev, results: [] }));
        
        setCaseSearch(prev => ({ ...prev, isSearching: true }));
        const results = await window.db.cases.where('firm_id').equals(firmId).filter(c => c.case_number.includes(term)).limit(10).toArray();
        setCaseSearch(prev => ({ ...prev, results, isSearching: false }));
    };

    const selectCase = (caseItem) => {
        setFormData({ ...formData, case_id: caseItem.id });
        setCaseSearch({ term: '', results: [], isSearching: false, display: `رقم القضية: ${caseItem.case_number}` });
    };

    const clearSelectedCase = () => {
        setFormData({ ...formData, case_id: '' });
        setCaseSearch(prev => ({ ...prev, display: null }));
    };

    // ==========================================
    // 4. معالجات الأحداث
    // ==========================================
    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
        setCurrentPage(1);
    };

    const openAddModal = () => {
        setIsEditing(false); setEditId(null);
        setFormData({ case_id: '', title: '', content: '', created_at: new Date().toISOString().split('T')[0] });
        setCaseSearch({ term: '', results: [], isSearching: false, display: null });
        setIsAddModalOpen(true);
    };

    const openEditModal = (doc) => {
        setIsEditing(true); setEditId(doc.id);
        setFormData({ case_id: doc.case_id, title: doc.title, content: doc.content, created_at: doc.safe_date });
        setCaseSearch({ term: '', results: [], isSearching: false, display: `رقم القضية: ${doc.case_number}` });
        setIsAddModalOpen(true);
    };

    const handleSaveDoc = async (e) => {
        e.preventDefault();
        if (!formData.case_id) {
            showToast("الرجاء اختيار القضية", "error"); return;
        }

        setIsLoading(true);
        try {
            const docData = {
                case_id: parseInt(formData.case_id),
                title: formData.title,
                doc_type: 'memo',
                content: formData.content,
                created_at: new Date(formData.created_at).toISOString()
            };

            if (isEditing) {
                await window.db.case_documents.update(editId, docData);
                showToast("تم تحديث المذكرة بنجاح", "success");
            } else {
                await window.db.case_documents.add(docData);
                showToast("تم حفظ المذكرة بنجاح", "success");
            }
            
            setRefreshTrigger(prev => prev + 1); 
            setIsAddModalOpen(false);
        } catch (error) {
            showToast("حدث خطأ أثناء الحفظ", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (confirm("هل أنت متأكد من حذف هذه المذكرة نهائياً؟")) {
            try {
                await window.db.case_documents.delete(id);
                if (tableData.length === 1 && currentPage > 1) setCurrentPage(prev => prev - 1);
                setRefreshTrigger(prev => prev + 1); 
                showToast("تم الحذف بنجاح", "success");
            } catch (error) { showToast("فشل الحذف", "error"); }
        }
    };

    // ==========================================
    // 🖨️ 5. دالة الطباعة الاحترافية (محسنة للموبايل وتنسيق A4)
    // ==========================================
    const handlePrint = () => {
        if (!viewMemo) return;
        setIsPrinting(true);

        // جلب اسم المكتب من الجلسة لوضعه في ترويسة الورقة
        const session = JSON.parse(localStorage.getItem('MentraLocal_Session') || '{}');
        const firmName = session.firm_name || 'مكتب المحاماة';

        // إنشاء Iframe مخفي لمنع المتصفح من حظر النافذة الجديدة (Pop-up blocker)
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        const printDocument = iframe.contentWindow.document;

        // تجهيز كود الـ HTML للطباعة بتنسيق قانوني A4
        const htmlContent = `
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>${viewMemo.title}</title>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
                <style>
                    /* إعدادات حجم الورقة وإخفاء روابط المتصفح العلوية والسفلية */
                    @page {
                        size: A4;
                        margin: 20mm;
                    }
                    body { 
                        font-family: 'Cairo', sans-serif; 
                        color: #000;
                        background: #fff;
                        line-height: 2.2; /* تباعد أسطر واسع يناسب المذكرات */
                        font-size: 16pt;
                        margin: 0;
                        padding: 0;
                        -webkit-print-color-adjust: exact;
                    }
                    /* ترويسة المكتب */
                    .header { 
                        text-align: center; 
                        margin-bottom: 20px; 
                        border-bottom: 3px double #000; 
                        padding-bottom: 10px; 
                    }
                    .firm-name {
                        font-size: 22pt;
                        font-weight: 900;
                        margin: 0;
                        color: #000;
                    }
                    .firm-desc {
                        font-size: 14pt;
                        font-weight: bold;
                        color: #333;
                    }
                    /* بيانات القضية */
                    .meta-info {
                        display: flex;
                        justify-content: space-between;
                        font-size: 14pt;
                        font-weight: bold;
                        margin-bottom: 30px;
                    }
                    /* عنوان المذكرة */
                    .memo-title {
                        text-align: center;
                        font-size: 20pt;
                        font-weight: 900;
                        text-decoration: underline;
                        margin-bottom: 30px;
                    }
                    /* محتوى المذكرة */
                    .content { 
                        font-size: 16pt; 
                        font-weight: 600; 
                        white-space: pre-wrap; 
                        text-align: justify; 
                        text-justify: inter-word;
                    }
                    /* ذيل الصفحة */
                    .footer {
                        margin-top: 50px;
                        padding-top: 10px;
                        border-top: 1px solid #ccc;
                        text-align: center;
                        font-size: 10pt;
                        color: #555;
                    }
                    /* منع قطع العناوين بين الصفحات */
                    h1, h2, h3, .memo-title { page-break-after: avoid; }
                    .content { page-break-inside: auto; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="firm-name">${firmName}</div>
                    <div class="firm-desc">للمحاماة والاستشارات القانونية</div>
                </div>

                <div class="meta-info">
                    <div><strong>القضية رقم:</strong> ${viewMemo.case_number}</div>
                    <div><strong>تاريخ التحرير:</strong> ${viewMemo.safe_date}</div>
                </div>

                <div class="memo-title">${viewMemo.title}</div>

                <div class="content">${viewMemo.content}</div>

                <div class="footer">
                    تم استخراج هذه المذكرة عبر نظام MentraLawyer
                </div>
            </body>
            </html>
        `;

        printDocument.write(htmlContent);
        printDocument.close();

        // إعطاء مهلة صغيرة ليتم تحميل الخط (Cairo) قبل إعطاء أمر الطباعة
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setIsPrinting(false);
            
            // حذف الـ Iframe بعد الانتهاء
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
        }, 800);
    };

    return (
        <div className="space-y-6 animate-view pb-8">
            
            {/* ====== 1. الرأس وشريط الفلترة (محسن للموبايل) ====== */}
            <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm p-4 md:p-5">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 md:mb-6">
                    <h3 className="font-black text-lg md:text-xl text-[#1E3A8A] flex items-center gap-2 w-full md:w-auto">
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><i className="fas fa-feather-alt"></i></div>
                        المذكرات والمرافعات
                        <span className="text-[10px] md:text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg mr-auto md:ml-2 md:mr-0 border border-slate-200">{totalFilteredItems} مذكرة</span>
                    </h3>
                    <button onClick={openAddModal} className="w-full md:w-auto bg-gradient-to-l from-indigo-600 to-indigo-800 hover:to-indigo-900 text-white px-5 py-3 md:px-6 md:py-2.5 rounded-xl md:rounded-2xl text-sm font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 active:scale-95">
                        <i className="fas fa-pen"></i> كتابة مذكرة جديدة
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
                    <div className="relative">
                        <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                        <input type="text" name="search" value={filters.search} onChange={handleFilterChange} placeholder="بحث بالعنوان، المحتوى..." className="w-full bg-white border border-slate-200 rounded-xl py-2.5 md:py-3 pr-10 pl-4 text-xs md:text-sm font-bold text-[#1E3A8A] outline-none focus:border-indigo-500 transition" />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] md:text-xs font-bold text-slate-400 whitespace-nowrap">من:</span>
                        <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="bg-transparent text-xs md:text-sm font-bold text-[#1E3A8A] outline-none w-full" />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] md:text-xs font-bold text-slate-400 whitespace-nowrap">إلى:</span>
                        <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="bg-transparent text-xs md:text-sm font-bold text-[#1E3A8A] outline-none w-full" />
                    </div>
                </div>
            </div>

            {/* ====== 2. عرض البيانات (محسن: بطاقات للموبايل، جدول للديسكتوب) ====== */}
            <div className="bg-transparent md:bg-white rounded-none md:rounded-3xl border-none md:border md:border-slate-200 md:shadow-sm overflow-hidden">
                {tableData.length === 0 ? (
                    <div className="py-16 md:py-20 text-center flex flex-col items-center bg-white rounded-2xl md:rounded-none border border-slate-200 md:border-none shadow-sm md:shadow-none">
                        <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-full flex items-center justify-center mb-3 md:mb-4 text-3xl md:text-4xl text-slate-300"><i className="fas fa-file-signature"></i></div>
                        <h3 className="font-black text-lg md:text-xl text-[#1E3A8A] mb-1">لا توجد مذكرات</h3>
                        <p className="text-slate-400 font-bold text-xs md:text-sm">ابدأ بكتابة أول مرافعة أو مذكرة دفاع لك.</p>
                    </div>
                ) : (
                    <>
                        {/* 📱 عرض الموبايل (Cards) */}
                        <div className="md:hidden flex flex-col gap-3">
                            {tableData.map((doc) => (
                                <div key={doc.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 relative overflow-hidden">
                                    <div className="flex items-start gap-3 border-b border-slate-50 pb-3 mb-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center border border-indigo-100 shrink-0">
                                            <i className="fas fa-file-alt"></i>
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <div className="font-black text-slate-700 text-sm mb-1">{doc.title}</div>
                                            <div className="font-bold text-[#1E3A8A] text-xs"><i className="fas fa-hashtag text-slate-300 mr-1"></i> {doc.case_number}</div>
                                        </div>
                                    </div>
                                    
                                    <div className="mb-4">
                                        <p className="text-[10px] text-slate-500 font-bold leading-relaxed line-clamp-2">{doc.content}</p>
                                        <div className="text-[9px] text-slate-400 font-bold mt-2"><i className="fas fa-calendar-alt mr-1"></i> التحرير: {doc.safe_date}</div>
                                    </div>

                                    <div className="flex gap-2 pt-3 border-t border-slate-50">
                                        <button onClick={() => setViewMemo(doc)} className="flex-1 bg-indigo-50 text-indigo-700 py-2 rounded-xl text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1 hover:bg-indigo-500 hover:text-white transition-colors">
                                            <i className="fas fa-book-open"></i> قراءة وطباعة
                                        </button>
                                        <button onClick={() => openEditModal(doc)} className="w-10 sm:w-auto sm:flex-1 bg-emerald-50 text-emerald-700 py-2 rounded-xl text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1 hover:bg-emerald-500 hover:text-white transition-colors">
                                            <i className="fas fa-pen"></i> <span className="hidden sm:inline">تعديل</span>
                                        </button>
                                        <button onClick={() => handleDelete(doc.id)} className="w-10 sm:w-auto sm:flex-1 bg-rose-50 text-rose-700 py-2 rounded-xl text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1 hover:bg-rose-500 hover:text-white transition-colors">
                                            <i className="fas fa-trash"></i> <span className="hidden sm:inline">حذف</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 💻 عرض الديسكتوب (Table) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-right">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider font-bold">
                                        <th className="px-6 py-4 rounded-tr-3xl">عنوان المذكرة / المرافعة</th>
                                        <th className="px-6 py-4">القضية المرتبطة</th>
                                        <th className="px-6 py-4">التاريخ</th>
                                        <th className="px-6 py-4 rounded-tl-3xl text-center">إجراءات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {tableData.map((doc) => (
                                        <tr key={doc.id} className="hover:bg-indigo-50/30 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center border border-indigo-100 shrink-0">
                                                        <i className="fas fa-file-alt"></i>
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-slate-700 text-sm mb-1">{doc.title}</div>
                                                        <div className="text-[10px] text-slate-400 font-bold truncate max-w-[250px]">{doc.content}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-[#1E3A8A] text-sm"><i className="fas fa-hashtag text-slate-300 mr-1"></i> {doc.case_number}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">{doc.safe_date}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => setViewMemo(doc)} className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-colors" title="قراءة وطباعة"><i className="fas fa-print"></i></button>
                                                    <button onClick={() => openEditModal(doc)} className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-colors" title="تعديل المذكرة"><i className="fas fa-pen"></i></button>
                                                    <button onClick={() => handleDelete(doc.id)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors" title="حذف المذكرة"><i className="fas fa-trash"></i></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
                
                {/* ====== 3. Pagination ====== */}
                {totalFilteredItems > itemsPerPage && (
                    <div className="p-3 md:p-4 mt-3 md:mt-0 border border-slate-200 md:border-t md:border-x-0 md:border-b-0 bg-white md:bg-slate-50 flex items-center justify-between rounded-2xl md:rounded-none shadow-sm md:shadow-none">
                        <p className="text-[11px] md:text-xs font-bold text-slate-500">
                            صفحة {currentPage} من {totalPages}
                        </p>
                        <div className="flex gap-1">
                            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-[#1E3A8A] hover:text-white transition-colors disabled:opacity-50"><i className="fas fa-chevron-right text-[10px] md:text-xs"></i></button>
                            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-[#1E3A8A] hover:text-white transition-colors disabled:opacity-50"><i className="fas fa-chevron-left text-[10px] md:text-xs"></i></button>
                        </div>
                    </div>
                )}
            </div>

            {/* ====== الإعلان الترويجي (الترقية للسحابة) ====== */}
            <div className="relative mt-8 bg-gradient-to-r from-slate-900 to-[#1E3A8A] rounded-2xl md:rounded-3xl p-5 md:p-8 text-white shadow-xl overflow-hidden border border-blue-900/50">
                <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500 rounded-full blur-[70px] opacity-20 -mr-10 -mt-10 pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-right">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-4 w-full">
                        <div className="w-14 h-14 shrink-0 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center text-2xl border border-white/20 text-indigo-300">
                            <i className="fas fa-file-pdf"></i>
                        </div>
                        <div>
                            <h4 className="font-black text-lg md:text-xl mb-1 text-white">تريد رفع صور التوكيلات ومحاضر الجلسات؟</h4>
                            <p className="text-blue-200 text-xs md:text-sm font-semibold max-w-lg leading-relaxed">
                                النسخة الحالية تدعم كتابة النصوص فقط لتوفير مساحة متصفحك. بادر بالترقية للنسخة السحابية للحصول على أرشيف رقمي كامل يسمح برفع (PDF, JPG, PNG) بلا حدود!
                            </p>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-auto shrink-0 flex flex-col gap-2">
                        <a href="https://wa.me/201211934816" target="_blank" rel="noopener noreferrer" className="w-full bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-900/30">
                            <i className="fas fa-cloud-upload-alt text-lg"></i>
                            تفعيل الأرشيف السحابي
                        </a>
                    </div>
                </div>
            </div>

            {/* ====== 4. Modal الإضافة والتعديل ====== */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-3 sm:p-4 animate-view">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-100 flex flex-col max-h-[95vh] md:max-h-[90vh]">
                        
                        <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-4 md:p-6 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3 text-white">
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-white/20 rounded-xl flex items-center justify-center text-base md:text-xl backdrop-blur-md">
                                    <i className={`fas ${isEditing ? 'fa-pen' : 'fa-pen-nib'}`}></i>
                                </div>
                                <h3 className="text-base md:text-xl font-black tracking-wide">{isEditing ? 'تعديل المذكرة' : 'كتابة مذكرة أو مرافعة'}</h3>
                            </div>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-white/50 hover:text-white transition text-lg bg-white/5 w-8 h-8 rounded-full flex items-center justify-center"><i className="fas fa-times"></i></button>
                        </div>

                        <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar flex-1">
                            <form onSubmit={handleSaveDoc} className="space-y-4 md:space-y-5">
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                                    <div className="relative">
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">القضية المرتبطة <span className="text-rose-500">*</span></label>
                                        {caseSearch.display ? (
                                            <div className="bg-emerald-50 border-2 border-emerald-200 p-3 rounded-xl flex items-center justify-between">
                                                <span className="text-xs md:text-sm font-bold text-emerald-800 flex items-center gap-1.5"><i className="fas fa-check-circle text-emerald-500"></i><span className="truncate">{caseSearch.display}</span></span>
                                                <button type="button" onClick={clearSelectedCase} className="text-rose-500 hover:bg-rose-100 w-7 h-7 rounded-lg transition-colors flex shrink-0 items-center justify-center"><i className="fas fa-times text-sm"></i></button>
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <input type="text" value={caseSearch.term} onChange={handleSearchCase} placeholder="ابحث برقم القضية..." className="w-full p-3 md:p-3.5 pl-10 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-indigo-500 font-bold text-xs md:text-sm text-[#1E3A8A]" />
                                                <i className={`fas ${caseSearch.isSearching ? 'fa-spinner fa-spin' : 'fa-search'} absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm`}></i>
                                                {caseSearch.results.length > 0 && (
                                                    <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                                        {caseSearch.results.map(c => (
                                                            <li key={c.id} onClick={() => selectCase(c)} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 font-bold text-[#1E3A8A] text-xs md:text-sm">رقم: {c.case_number}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">عنوان المذكرة <span className="text-rose-500">*</span></label>
                                        <input type="text" name="title" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} required placeholder="مثال: مذكرة دفاع في جنحة..." className="w-full p-3 md:p-3.5 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-indigo-500 focus:bg-white font-bold text-xs md:text-sm text-[#1E3A8A] transition-all" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] md:text-xs font-bold text-slate-500 mb-1.5">نص المذكرة / المرافعة <span className="text-rose-500">*</span></label>
                                    <textarea name="content" value={formData.content} onChange={(e) => setFormData({...formData, content: e.target.value})} required rows="8" placeholder="اكتب مذكرتك هنا بحرية..." className="w-full p-3 md:p-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none focus:border-indigo-500 focus:bg-white font-bold text-xs md:text-sm text-slate-800 transition-all resize-none leading-loose"></textarea>
                                </div>

                                <div className="pt-2">
                                    <button type="submit" disabled={isLoading || !formData.case_id} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 md:py-4 rounded-xl shadow-lg transition-all text-sm md:text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                                        {isLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-save"></i> {isEditing ? 'حفظ التعديلات' : 'حفظ المذكرة'}</>}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ====== 5. Modal عرض وطباعة المذكرة (محسن للموبايل) ====== */}
            {viewMemo && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300] flex items-center justify-center p-3 sm:p-4 animate-view">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh]">
                        
                        {/* Header */}
                        <div className="p-4 border-b border-slate-100 flex justify-between items-start md:items-center bg-slate-50 shrink-0 flex-col md:flex-row gap-3">
                            <h3 className="font-black text-base md:text-lg text-[#1E3A8A] flex items-center gap-2 w-full md:w-auto pr-8 md:pr-0">
                                <i className="fas fa-book-open text-indigo-500 shrink-0"></i> 
                                <span className="truncate">{viewMemo.title}</span>
                            </h3>
                            
                            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                                <button onClick={handlePrint} disabled={isPrinting} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 disabled:opacity-50">
                                    {isPrinting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-print"></i>}
                                    {isPrinting ? 'جاري التجهيز...' : 'طباعة كـ PDF'}
                                </button>
                                <button onClick={() => setViewMemo(null)} className="absolute top-4 left-4 md:relative md:top-0 md:left-0 w-8 h-8 bg-slate-200 text-slate-500 rounded-full hover:bg-rose-500 hover:text-white transition flex items-center justify-center shrink-0">
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        
                        {/* Content */}
                        <div className="p-4 md:p-8 overflow-y-auto custom-scrollbar bg-[#F8FAFC] flex-1">
                            <div className="bg-white p-4 md:p-10 rounded-2xl shadow-sm border border-slate-100 min-h-[300px] md:min-h-[400px]">
                                <pre className="font-bold text-sm md:text-base text-slate-800 whitespace-pre-wrap break-words leading-loose text-justify" style={{fontFamily: "'Cairo', sans-serif"}}>{viewMemo.content}</pre>
                            </div>
                            <div className="mt-4 text-left">
                                <span className="text-[9px] md:text-[10px] text-slate-400 font-bold bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">تاريخ التحرير: {viewMemo.safe_date}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};