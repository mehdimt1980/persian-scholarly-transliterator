# Phase 8F — MARC linkage validation

The parser accepts MARCXML default or prefixed namespaces, preserves repeated control/data fields, both indicators, ordered subfields, and original record XML. It rejects DTD, entity declarations, and XML stylesheet processing before parsing; no external entity resolution exists.

An 880 is linked only when its `$6` has `TAG-NN` and the corresponding base field has `880-NN`. Script suffixes such as `/(3/r` are preserved but do not alter occurrence matching. Phase 8F supports linkage for 100, 110, 245, 700, and 710; 111 and unrelated 880 content remain preserved by the parser but are not promoted to candidates.

For an original-script 880 linked to a Latin 245, the Latin value is a `ROMANIZATION_CANDIDATE`, not a verified IJMES form. Latin 246 with second indicator 1 is retained as translated/parallel-title evidence; other Latin 246 values are undetermined. The implementation does not infer unencoded relationships. The authentic records `991071006889707356` and `991144600686807356` validate 245/880 and 710/880 linkage. Arabic-script records lacking Persian language metadata fail closed and yield no candidate.
