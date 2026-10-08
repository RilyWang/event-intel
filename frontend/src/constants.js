export const STATUS_COLOR = {
  rumor: 'orange', disclosed: 'blue', confirmed: 'green',
  denied: 'red', corrected: 'purple', expired: 'default',
};

export const EVIDENCE_COLOR = { fact: 'green', opinion: 'blue', speculation: 'orange', rumor: 'red' };

export const LEVEL_CN = { 5: '交易所/公告', 4: '权威媒体', 3: '券商研报', 2: '一般媒体', 1: '社媒/论坛' };

export const CHANGE_CN = { initial: '首次识别', update: '更新', deny: '否认', correct: '更正', expire: '过期' };

export const TRIGGER_CN = { '1': '状态变更（否认/更正）', '2': '影响方向翻转', '3': '置信度显著变化', '4': '存在冲突证据' };

export const CONF_COLOR = (v) => (v >= 80 ? '#389e0d' : v >= 60 ? '#d46b08' : '#999');
