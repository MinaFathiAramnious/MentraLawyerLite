// pages/backup.js
const { useState, useEffect, useRef } = React;

window.Module_Backup = function({ firmId, showToast }) {
    const [activeTab, setActiveTab] = useState('export'); 
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState([]); 
    const fileInputRef = useRef(null);

    const addLog = (msg, type = 'info') => {
        setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
    };

    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 10));

    // =========================================================================
    // 1. نظام التصدير المتقدم
    // =========================================================================
    const handleExport = async () => {
        setIsProcessing(true);
        setProgress(0);
        setLogs([]);
        addLog("بدء عملية تجهيز بيانات المكتب الحالي فقط...", "info");
        
        try {
            const exportData = {
                metadata: {
                    version: 2,
                    timestamp: new Date().toISOString(),
                    firmId: firmId,
                    app: "MentraLawyer Offline"
                },
                data: {}
            };

            addLog("جاري استخراج بيانات الموكلين والفروع...", "info");
            const clients = await window.db.clients.where('firm_id').equals(firmId).toArray();
            const clientIds = clients.map(c => c.id);
            
            const cases = await window.db.cases.where('firm_id').equals(firmId).toArray();
            const caseIds = cases.map(c => c.id);
            
            const branches = await window.db.branches.where('firm_id').equals(firmId).toArray();
            const branchIds = branches.map(b => b.id);

            setProgress(20);
            await yieldToMain();

            addLog("جاري استخراج الجلسات والمستندات...", "info");
            const allSessions = await window.db.agenda_sessions.toArray();
            const sessions = allSessions.filter(s => caseIds.includes(s.case_id));

            const allDocs = await window.db.case_documents.toArray();
            const documents = allDocs.filter(d => caseIds.includes(d.case_id));

            setProgress(50);
            await yieldToMain();

            addLog("جاري استخراج الماليات...", "info");
            const allPayments = await window.db.client_payments.toArray();
            const payments = allPayments.filter(p => clientIds.includes(p.client_id));

            const allExpenses = await window.db.firm_expenses.toArray();
            const expenses = allExpenses.filter(e => branchIds.includes(e.branch_id));

            setProgress(80);
            await yieldToMain();

            exportData.data = {
                branches: branches,
                clients: clients,
                cases: cases,
                case_documents: documents,
                agenda_sessions: sessions,
                client_payments: payments,
                firm_expenses: expenses
            };

            addLog("جاري ضغط وبناء ملف النسخة الاحتياطية...", "info");
            await yieldToMain();

            const jsonString = JSON.stringify(exportData);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const firm = await window.db.law_firms.get(firmId);
            const firmNameSafe = firm ? firm.name.replace(/\s+/g, '_') : 'MyFirm';
            const fileName = `MentraBackup_${firmNameSafe}_${new Date().toISOString().split('T')[0]}.json`;

            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setProgress(100);
            addLog("🎉 تمت عملية التصدير بنجاح! احتفظ بالملف في مكان آمن.", "success");
            showToast("تم تحميل النسخة الاحتياطية", "success");

        } catch (error) {
            console.error(error);
            addLog(`خطأ فادح: ${error.message}`, "error");
            showToast("فشل التصدير", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    // =========================================================================
    // 2. نظام الاستيراد المتقدم
    // =========================================================================
    const handleImportClick = () => {
        fileInputRef.current.click();
    };

    const processImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const confirmMsg = "⚠️ تحذير: استعادة النسخة الاحتياطية سيقوم باستبدال قضايا وموكلين هذا المكتب فقط. (لن يتأثر اسم المكتب أو كلمة المرور). هل تريد المتابعة؟";
        if (!confirm(confirmMsg)) {
            e.target.value = null; 
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setLogs([]);
        addLog(`جاري قراءة الملف: ${file.name}...`, "info");

        try {
            const text = await file.text();
            addLog("تمت القراءة. جاري تحليل البيانات...", "info");
            await yieldToMain();

            const importedData = JSON.parse(text);

            if (!importedData.metadata || importedData.metadata.app !== "MentraLawyer Offline") {
                throw new Error("ملف النسخة الاحتياطية غير صالح أو لا يتبع هذا النظام.");
            }

            addLog("تم التحقق من الملف. جاري تفريغ البيانات القديمة لهذا المكتب فقط...", "warning");
            await yieldToMain();

            const currentClients = await window.db.clients.where('firm_id').equals(firmId).toArray();
            const currentClientIds = currentClients.map(c => c.id);
            const currentCases = await window.db.cases.where('firm_id').equals(firmId).toArray();
            const currentCaseIds = currentCases.map(c => c.id);
            const currentBranches = await window.db.branches.where('firm_id').equals(firmId).toArray();
            const currentBranchIds = currentBranches.map(b => b.id);

            const sessionsToDelete = await window.db.agenda_sessions.filter(s => currentCaseIds.includes(s.case_id)).primaryKeys();
            await window.db.agenda_sessions.bulkDelete(sessionsToDelete);

            const docsToDelete = await window.db.case_documents.filter(d => currentCaseIds.includes(d.case_id)).primaryKeys();
            await window.db.case_documents.bulkDelete(docsToDelete);

            const paymentsToDelete = await window.db.client_payments.filter(p => currentClientIds.includes(p.client_id)).primaryKeys();
            await window.db.client_payments.bulkDelete(paymentsToDelete);

            const expensesToDelete = await window.db.firm_expenses.filter(e => currentBranchIds.includes(e.branch_id)).primaryKeys();
            await window.db.firm_expenses.bulkDelete(expensesToDelete);

            await window.db.cases.where('firm_id').equals(firmId).delete();
            await window.db.clients.where('firm_id').equals(firmId).delete();
            await window.db.branches.where('firm_id').equals(firmId).delete();

            setProgress(40);
            addLog("تم تفريغ البيانات القديمة بنجاح. جاري حقن النسخة الجديدة...", "info");
            await yieldToMain();

            const dataToRestore = importedData.data;
            const tablesToRestore = Object.keys(dataToRestore);
            let currentTableIndex = 0;

            for (const tableName of tablesToRestore) {
                if (!window.db[tableName]) continue;

                addLog(`حقن جدول: ${tableName}...`, "info");
                let records = dataToRestore[tableName];
                
                records = records.map(record => {
                    if (record.hasOwnProperty('firm_id')) {
                        record.firm_id = firmId;
                    }
                    return record;
                });

                const chunkSize = 5000;
                for (let offset = 0; offset < records.length; offset += chunkSize) {
                    const chunk = records.slice(offset, offset + chunkSize);
                    await window.db[tableName].bulkPut(chunk); 
                    await yieldToMain();
                }
                
                addLog(`تم استعادة ${records.length} سجل في ${tableName}.`, "success");
                
                currentTableIndex++;
                const overallProgress = 40 + ((currentTableIndex / tablesToRestore.length) * 60);
                setProgress(Math.round(overallProgress));
            }

            setProgress(100);
            addLog("🎉 تمت استعادة البيانات بالكامل بنجاح!", "success");
            showToast("تمت الاستعادة. سيتم تحديث الصفحة.", "success");
            
            setTimeout(() => { window.location.reload(); }, 2000);

        } catch (error) {
            console.error(error);
            addLog(`خطأ فادح: ${error.message}`, "error");
            showToast("فشل استيراد البيانات", "error");
        } finally {
            setIsProcessing(false);
            e.target.value = null;
        }
    };

    const logsEndRef = useRef(null);
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    return (
        <div className="space-y-6 animate-view max-w-5xl mx-auto pb-8">
            
            {/* ====== 1. الرأس (محسن للموبايل) ====== */}
            <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col md:flex-row gap-4 justify-between items-center relative overflow-hidden text-center md:text-right">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-100 rounded-full blur-3xl opacity-50"></div>
                <div className="flex flex-col md:flex-row items-center gap-3 md:gap-4 relative z-10 w-full md:w-auto">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl md:text-2xl shadow-inner border border-indigo-100">
                        <i className="fas fa-server"></i>
                    </div>
                    <div>
                        <h3 className="font-black text-xl md:text-2xl text-[#1E3A8A]">إدارة قواعد البيانات</h3>
                        <p className="text-[10px] md:text-xs font-bold text-slate-400 mt-1">نسخ واستعادة البيانات بأمان وسرية تامة</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                
                {/* ====== 2. القائمة الجانبية (تمرير أفقي على الموبايل) ====== */}
                <div className="w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-2 overflow-x-auto hide-scrollbar pb-1 md:pb-0 snap-x">
                    <button onClick={() => !isProcessing && setActiveTab('export')} disabled={isProcessing} className={`snap-center flex-1 md:flex-none flex justify-center md:justify-start items-center gap-2 md:gap-3 p-3 md:p-4 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm transition-all whitespace-nowrap ${activeTab === 'export' ? 'bg-[#1E3A8A] text-white shadow-lg shadow-blue-900/20' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
                        <i className="fas fa-cloud-download-alt w-4 md:w-5 text-center"></i> تصدير (Backup)
                    </button>
                    <button onClick={() => !isProcessing && setActiveTab('import')} disabled={isProcessing} className={`snap-center flex-1 md:flex-none flex justify-center md:justify-start items-center gap-2 md:gap-3 p-3 md:p-4 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm transition-all whitespace-nowrap ${activeTab === 'import' ? 'bg-[#1E3A8A] text-white shadow-lg shadow-blue-900/20' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
                        <i className="fas fa-cloud-upload-alt w-4 md:w-5 text-center"></i> استعادة (Restore)
                    </button>
                </div>

                {/* ====== 3. مساحة العمل (تصدير / استيراد) ====== */}
                <div className="flex-1 bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    
                    <div className="p-5 md:p-8 border-b border-slate-100">
                        {activeTab === 'export' ? (
                            <div className="text-center max-w-lg mx-auto">
                                <i className="fas fa-file-export text-5xl md:text-6xl text-slate-300 mb-3 md:mb-4"></i>
                                <h4 className="font-black text-lg md:text-xl text-[#1E3A8A] mb-2">إنشاء نسخة احتياطية محلية</h4>
                                <p className="text-xs md:text-sm font-bold text-slate-500 mb-5 md:mb-6 leading-relaxed">
                                    هذه العملية ستقوم بتجميع كافة بيانات مكتبك وضغطها في ملف واحد (JSON). يرجى الاحتفاظ به في مكان آمن للرجوع إليه. <br/><span className="text-emerald-600 font-black text-[10px] md:text-xs">ملاحظة: الملف لا يحتوي على كلمات المرور لحمايتك.</span>
                                </p>
                                <button onClick={handleExport} disabled={isProcessing} className="w-full bg-[#1E3A8A] hover:bg-blue-900 text-white font-black py-3.5 md:py-4 rounded-xl shadow-xl shadow-blue-900/20 transition-all text-sm md:text-lg flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                                    {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-download"></i>}
                                    {isProcessing ? 'جاري تصدير البيانات...' : 'بدء التصدير الآن'}
                                </button>
                            </div>
                        ) : (
                            <div className="text-center max-w-lg mx-auto">
                                <i className="fas fa-file-import text-5xl md:text-6xl text-slate-300 mb-3 md:mb-4"></i>
                                <h4 className="font-black text-lg md:text-xl text-[#1E3A8A] mb-2">استعادة بيانات المكتب</h4>
                                <div className="bg-amber-50 border border-amber-200 p-3 md:p-4 rounded-xl mb-5 md:mb-6 text-right">
                                    <p className="text-[10px] md:text-[11px] font-bold text-amber-700 leading-relaxed flex items-start gap-2">
                                        <i className="fas fa-exclamation-triangle mt-0.5"></i>
                                        بمجرد رفع ملف النسخة الاحتياطية، سيتم مسح القضايا الحالية واستبدالها ببيانات الملف. لن يتأثر اسم المكتب أو كلمة المرور الحالية.
                                    </p>
                                </div>
                                <input type="file" accept=".json" ref={fileInputRef} onChange={processImport} className="hidden" />
                                <button onClick={handleImportClick} disabled={isProcessing} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-3.5 md:py-4 rounded-xl shadow-xl shadow-amber-500/20 transition-all text-sm md:text-lg flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                                    {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-upload"></i>}
                                    {isProcessing ? 'جاري حقن البيانات...' : 'اختيار ملف ورفع البيانات'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ====== 4. شاشة التيرمينال (محسنة للموبايل لعدم تسرب النصوص) ====== */}
                    <div className="flex-1 bg-[#0F172A] p-4 md:p-6 relative overflow-hidden flex flex-col min-h-[200px] md:min-h-[300px]">
                        <div className="flex justify-between items-center mb-3 md:mb-4 pb-2 border-b border-white/10">
                            <span className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest"><i className="fas fa-terminal mr-2"></i> System Logs</span>
                            <span className="text-[#D4AF37] text-[10px] md:text-xs font-black">{progress}%</span>
                        </div>

                        {/* شريط التقدم */}
                        {isProcessing && (
                            <div className="w-full bg-slate-800 rounded-full h-1 md:h-1.5 mb-3 md:mb-4 overflow-hidden">
                                <div className="bg-[#D4AF37] h-1 md:h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>
                        )}

                        {/* النصوص تم إضافة break-words و whitespace-pre-wrap لمنع الـ Overflow */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-[10px] md:text-xs space-y-2 dir-ltr text-left">
                            {logs.length === 0 ? (
                                <p className="text-slate-600 italic">Waiting for operations...</p>
                            ) : (
                                logs.map((log, idx) => (
                                    <div key={idx} className="flex gap-2 items-start">
                                        <span className="text-slate-500 shrink-0 whitespace-nowrap">[{log.time}]</span>
                                        <span className={`break-words whitespace-pre-wrap
                                            ${log.type === 'error' ? 'text-rose-400' : ''}
                                            ${log.type === 'success' ? 'text-emerald-400' : ''}
                                            ${log.type === 'warning' ? 'text-amber-400' : ''}
                                            ${log.type === 'info' ? 'text-blue-300' : ''}
                                        `}>
                                            {log.msg}
                                        </span>
                                    </div>
                                ))
                            )}
                            <div ref={logsEndRef} />
                        </div>
                    </div>
                </div>
            </div>

            {/* ====== الإعلان الترويجي (الترقية للسحابة) ====== */}
            <div className="relative mt-8 bg-gradient-to-r from-blue-900 to-[#1E3A8A] rounded-2xl md:rounded-3xl p-5 md:p-8 text-white shadow-xl overflow-hidden border border-blue-800/50">
                <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full blur-[80px] opacity-10 -ml-10 -mt-10 pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-right">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start md:items-center gap-4 w-full">
                        <div className="w-14 h-14 shrink-0 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center text-2xl border border-white/20">
                            <i className="fas fa-cloud-upload-alt text-[#D4AF37]"></i>
                        </div>
                        <div>
                            <h4 className="font-black text-lg md:text-xl mb-1">خائف من ضياع بياناتك أو تلف جهازك؟</h4>
                            <p className="text-blue-200 text-xs md:text-sm font-semibold max-w-lg leading-relaxed">
                                في النسخة المجانية (الحالية) أنت المسؤول عن أخذ النسخ الاحتياطية يدوياً. قم بالترقية للنسخة السحابية للاستمتاع <strong>بنسخ احتياطي يومي تلقائي</strong> مع حماية كاملة ضد تلف المتصفح أو الأجهزة.
                            </p>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-auto shrink-0 flex flex-col gap-2">
                        <a href="https://wa.me/201211934816" target="_blank" rel="noopener noreferrer" className="w-full bg-[#D4AF37] hover:bg-yellow-500 text-[#1E3A8A] px-6 py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-yellow-900/20">
                            <i className="fab fa-whatsapp text-lg"></i>
                            تأمين مكتبي الآن
                        </a>
                    </div>
                </div>
            </div>

        </div>
    );
};