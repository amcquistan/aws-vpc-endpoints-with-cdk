# kinesis_consumer.py

import argparse

import boto3


def main(args):

    stream_name = args.stream_name
    shard_id = args.shard_id
    aws_region = args.region

    kinesis = boto3.client('kinesis', region_name=aws_region)

    itr_response = kinesis.get_shard_iterator(StreamName=stream_name,
                                              ShardId=shard_id,
                                              ShardIteratorType='TRIM_HORIZON')

    shard_itr = itr_response['ShardIterator']
    records_response = kinesis.get_records(ShardIterator=shard_itr, Limit=200)

    fmt = "{:^20} {:^60} {:<40}"
    print(fmt.format("Shard", "Position", "Message"))
    print(fmt.format("-"*20, "-"*60, "-"*40))
    for record in records_response['Records']:
        print(fmt.format(shard_id, record['SequenceNumber'], record['Data'].decode('utf-8')))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stream-name')
    parser.add_argument('--shard-id')
    parser.add_argument('--region')
    args = parser.parse_args()

    main(args)

