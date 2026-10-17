-- v11: 요일별 추가 이미지에 ON/OFF 스위치 추가 (삭제하지 않고 일시 중지)
alter table scheduled_image_sets add column if not exists enabled boolean not null default true;
